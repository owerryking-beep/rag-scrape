/**
 * Smart Markdown chunking for RAG pipelines.
 *
 * Strategy (deterministic, zero deps):
 *  1. Split the document into blocks: headings (with level) and content
 *     lines, never breaking inside a fenced code block.
 *  2. Walk blocks while tracking the active heading path (H1 → H2 → H3…).
 *  3. Flush a chunk when it would exceed `maxChars` or when a new heading
 *     starts (so chunks align with semantic sections when they're small).
 *  4. A single oversized block (huge paragraph or code fence) is hard-split
 *     at line boundaries; code fences are re-opened/closed per piece.
 *
 * The result is stable for a given input: same page → same chunks → same
 * embedding IDs, which matters for incremental re-indexing.
 *
 * Chunk shape is the shared type from ../types.js (it optionally carries a
 * Workers-AI embedding when /scrape runs with embed:true).
 */
import type { Chunk } from "../types.js";

interface Block {
  kind: "heading" | "content";
  level: number; // heading level 1–6; 0 for content
  lines: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

export function chunkMarkdown(markdown: string, maxChars = 4000): Chunk[] {
  const size = Math.max(200, Math.min(16_000, Math.floor(maxChars)));
  const blocks = toBlocks(markdown);

  const chunks: Chunk[] = [];
  const headingPath: string[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      bufferLen = 0;
      return;
    }
    chunks.push({
      index: chunks.length,
      content,
      headingPath: [...headingPath],
      charCount: content.length,
    });
    buffer = [];
    bufferLen = 0;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      // A new heading closes the previous section, then updates the path.
      flush();
      headingPath.length = block.level - 1;
      headingPath.push(block.lines[0]?.replace(HEADING_RE, "$2").trim() ?? "");
      buffer.push(block.lines[0] ?? "");
      bufferLen += (block.lines[0]?.length ?? 0) + 1;
      continue;
    }

    const blockText = block.lines.join("\n");
    if (bufferLen + blockText.length + 1 <= size) {
      buffer.push(...block.lines);
      bufferLen += blockText.length + buffer.length; // close enough for gating
      continue;
    }

    // Doesn't fit: flush what we have, then handle this block on its own.
    flush();

    if (blockText.length <= size) {
      buffer.push(...block.lines);
      bufferLen = blockText.length;
      continue;
    }

    // Oversized block → hard-split at line boundaries (keep fences intact).
    for (const piece of splitOversized(block.lines, size)) {
      const content = piece.join("\n").trim();
      if (content) {
        chunks.push({
          index: chunks.length,
          content,
          headingPath: [...headingPath],
          charCount: content.length,
        });
      }
    }
  }

  flush();
  return chunks;
}

function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { kind: "content", level: 0, lines: [] };
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (FENCE_RE.test(line)) inFence = !inFence;

    const heading = !inFence ? line.match(HEADING_RE) : null;
    if (heading && !inFence) {
      if (current.lines.length) blocks.push(current);
      blocks.push({ kind: "heading", level: heading[1]?.length ?? 1, lines: [line] });
      current = { kind: "content", level: 0, lines: [] };
      continue;
    }

    if (!line.trim() && current.kind === "content" && !inFence) {
      // Paragraph separator — close the block so size gating works per-para.
      if (current.lines.length) {
        blocks.push(current);
        current = { kind: "content", level: 0, lines: [] };
      }
      continue;
    }

    current.lines.push(line);
  }
  if (current.lines.length) blocks.push(current);
  return blocks;
}

function* splitOversized(lines: string[], size: number): Generator<string[]> {
  let piece: string[] = [];
  let pieceLen = 0;
  // Track fence state so every piece stays a balanced code block.
  let fenceOpen = false;
  let fenceMarker = "```";

  for (const line of lines) {
    const isFence = FENCE_RE.test(line);
    const lineCost = line.length + 1;

    if (pieceLen + lineCost > size && piece.length) {
      if (fenceOpen) piece.push(fenceMarker); // close for this piece
      yield piece;
      piece = fenceOpen ? [fenceMarker] : []; // reopen in the next piece
      pieceLen = piece.reduce((n, l) => n + l.length + 1, 0);
    }

    if (isFence) {
      fenceMarker = (line.trim().startsWith("~~~") ? "~~~" : "```");
      fenceOpen = !fenceOpen;
    }

    piece.push(line);
    pieceLen += lineCost;
  }
  if (piece.length) yield piece;
}
