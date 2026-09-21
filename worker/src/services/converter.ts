/**
 * Converts HTML → clean Markdown entirely with string manipulation.
 *
 * Why not Turndown?
 *  – Turndown internally requires a real browser DOM (document.createElement,
 *    range APIs…) which linkedom does not fully implement; inside Workers it
 *    is a source of runtime errors.
 *  – This walker uses only the narrow tree API linkedom provides
 *    (childNodes / tagName / getAttribute), eliminates the Turndown
 *    dependency, and keeps the bundle small. It covers the element set that
 *    survives Readability extraction.
 */

import { parseHTML } from "linkedom";
import type { DomDocument, DomElement, DomNode } from "./dom.js";
import { NODE_ELEMENT, NODE_TEXT } from "./dom.js";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param html    Fragment or full document HTML (typically Readability output).
 * @param baseUrl If given, relative `href`/`src` values are resolved against it.
 */
export function htmlToMarkdown(html: string, baseUrl?: string): string {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
  );
  const body = (document as unknown as DomDocument).querySelector("body");
  if (!body) return "";

  let md = walkNode(body, baseUrl);
  md = cleanMarkdown(md);
  return md;
}

export function countWords(text: string): number {
  return text
    .replace(/[#*`\[\]()!|>\-_~]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ── URL resolution ───────────────────────────────────────────────────────────

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i;

function resolveUrl(href: string, baseUrl?: string): string {
  const h = href.trim();
  if (!h || h.startsWith("#")) return h;
  if (ABSOLUTE_URL_RE.test(h)) return h; // http:, https:, mailto:, …
  if (!baseUrl) return h;
  try {
    const abs = new URL(h, baseUrl);
    return abs.protocol === "http:" || abs.protocol === "https:"
      ? abs.toString()
      : h;
  } catch {
    return h;
  }
}

// ── Recursive DOM → Markdown walker ──────────────────────────────────────────

/**
 * Tags where surrounding whitespace text is meaningful (word separators).
 * Whitespace-only text nodes under any *other* parent are HTML formatting
 * between blocks and get dropped — otherwise they become phantom blank
 * lines in the Markdown.
 */
const INLINE_TAGS = new Set([
  "a", "span", "strong", "b", "em", "i", "s", "del", "strike", "code",
  "small", "sub", "sup", "abbr", "time", "mark", "u", "ins", "q",
  "cite", "kbd", "samp", "var", "label", "figcaption",
]);

function walkNode(node: DomNode, baseUrl?: string): string {
  // Text node
  if (node.nodeType === NODE_TEXT) {
    const raw = node.textContent ?? "";
    if (!raw.trim()) {
      const parentTag = (node.parentElement?.tagName ?? "").toLowerCase();
      return INLINE_TAGS.has(parentTag) ? " " : "";
    }
    return escapeText(raw);
  }

  // Not an element — skip comments, CDATA, etc.
  if (node.nodeType !== NODE_ELEMENT) return "";

  const el = node as DomElement;
  const tag = (el.tagName ?? "").toLowerCase();

  if (["script", "style", "noscript", "svg", "iframe", "canvas"].includes(tag)) {
    return "";
  }

  const childMd = Array.from(el.childNodes)
    .map((child) => walkNode(child, baseUrl))
    .join("");

  switch (tag) {
    // ── Headings ──────────────────────────────────────────────────────────
    case "h1":
      return `\n\n# ${childMd.trim()}\n\n`;
    case "h2":
      return `\n\n## ${childMd.trim()}\n\n`;
    case "h3":
      return `\n\n### ${childMd.trim()}\n\n`;
    case "h4":
      return `\n\n#### ${childMd.trim()}\n\n`;
    case "h5":
      return `\n\n##### ${childMd.trim()}\n\n`;
    case "h6":
      return `\n\n###### ${childMd.trim()}\n\n`;

    // ── Paragraphs / blocks ───────────────────────────────────────────────
    case "p":
      return `\n\n${childMd.trim()}\n\n`;
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "blockquote":
      return (
        "\n\n" +
        childMd
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") +
        "\n\n"
      );

    // ── Inline formatting ─────────────────────────────────────────────────
    case "strong":
    case "b":
      return `**${childMd.trim()}**`;
    case "em":
    case "i":
      return `*${childMd.trim()}*`;
    case "del":
    case "s":
    case "strike":
      return `~~${childMd.trim()}~~`;
    case "code": {
      // Inline code (not inside <pre>)
      const parent = el.parentElement;
      if (parent?.tagName?.toLowerCase() === "pre") {
        return childMd; // handled by <pre>
      }
      return `\`${childMd.trim()}\``;
    }
    case "mark":
      return `==${childMd.trim()}==`;

    // ── Links ─────────────────────────────────────────────────────────────
    case "a": {
      const href = resolveUrl(el.getAttribute("href") ?? "", baseUrl);
      const text = childMd.trim();
      if (!href) return text;
      if (!text) return href; // icon-only link: at least keep the destination
      return `[${text}](${href})`;
    }

    // ── Images ────────────────────────────────────────────────────────────
    case "img": {
      const src = resolveUrl(
        el.getAttribute("src") ?? el.getAttribute("data-src") ?? "",
        baseUrl,
      );
      const alt =
        el.getAttribute("alt") ?? el.getAttribute("title") ?? "image";
      if (!src) return "";
      return `![${alt}](${src})`;
    }

    // ── Code blocks ───────────────────────────────────────────────────────
    case "pre": {
      const codeEl = el.querySelector("code");
      const raw = codeEl ? codeEl.textContent ?? "" : el.textContent ?? "";
      let lang = "";
      if (codeEl) {
        const cls = codeEl.getAttribute("class") ?? "";
        const m = cls.match(/(?:language-|lang-|highlight-)(\w+)/);
        if (m && m[1]) lang = m[1];
      }
      return `\n\n\`\`\`${lang}\n${raw.trim()}\n\`\`\`\n\n`;
    }

    // ── Lists ─────────────────────────────────────────────────────────────
    case "ul":
      return "\n\n" + renderList(el, false, baseUrl) + "\n\n";
    case "ol":
      return "\n\n" + renderList(el, true, baseUrl) + "\n\n";
    case "li":
      // Only reached if an <li> appears outside a list (malformed HTML).
      return childMd;

    // ── Tables ────────────────────────────────────────────────────────────
    case "table":
      return "\n\n" + renderTable(el) + "\n\n";

    // ── Definition lists ──────────────────────────────────────────────────
    case "dt":
      return `\n\n**${childMd.trim()}**\n`;
    case "dd":
      return `: ${childMd.trim()}\n`;

    // ── Figure / figcaption ───────────────────────────────────────────────
    case "figure":
      return `\n\n${childMd.trim()}\n\n`;
    case "figcaption":
      return `\n*${childMd.trim()}*\n`;

    // ── Semantic wrappers — pass through ──────────────────────────────────
    default:
      return childMd;
  }
}

// ── List rendering ───────────────────────────────────────────────────────────

function renderList(
  el: DomElement,
  ordered: boolean,
  baseUrl?: string,
  depth: number = 0,
): string {
  const items = Array.from(el.children).filter(
    (c) => (c.tagName ?? "").toLowerCase() === "li",
  );
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  items.forEach((li, idx) => {
    const prefix = ordered ? `${idx + 1}. ` : "- ";
    const parts: string[] = [];

    for (const child of Array.from(li.childNodes)) {
      const childTag =
        child.nodeType === NODE_ELEMENT
          ? ((child as DomElement).tagName ?? "").toLowerCase()
          : null;

      if (childTag === "ul") {
        parts.push(
          "\n" + renderList(child as DomElement, false, baseUrl, depth + 1),
        );
      } else if (childTag === "ol") {
        parts.push(
          "\n" + renderList(child as DomElement, true, baseUrl, depth + 1),
        );
      } else {
        parts.push(walkNode(child, baseUrl));
      }
    }

    const text = parts.join("").trim();
    lines.push(`${indent}${prefix}${text}`);
  });

  return lines.join("\n");
}

// ── Table rendering ──────────────────────────────────────────────────────────

function renderTable(el: DomElement): string {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const tableData: string[][] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const rowData: string[] = [];
    for (const cell of cells) {
      rowData.push(
        (cell.textContent ?? "")
          .trim()
          .replace(/\|/g, "\\|")
          .replace(/\n+/g, " "),
      );
    }
    tableData.push(rowData);
  }

  if (tableData.length === 0) return "";

  const maxCols = Math.max(...tableData.map((r) => r.length));
  const normalised = tableData.map((row) => {
    const copy = [...row];
    while (copy.length < maxCols) copy.push("");
    return copy;
  });

  const head = normalised[0];
  if (!head) return "";
  let md = `| ${head.join(" | ")} |\n`;
  md += `| ${head.map(() => "---").join(" | ")} |\n`;
  for (let i = 1; i < normalised.length; i++) {
    const row = normalised[i];
    if (!row) continue;
    md += `| ${row.join(" | ")} |\n`;
  }
  return md;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeText(text: string): string {
  // Tabs and non-breaking spaces are noise in Markdown source, and raw
  // newlines inside text nodes would break paragraph flow (a 4-space-indent
  // continuation line even becomes an indented code block in CommonMark).
  // <pre> content never passes through here, so code formatting is safe.
  return text
    .replace(/[\t\u00a0]/g, " ")
    .replace(/\s*\n\s*/g, " ");
}

function cleanMarkdown(md: string): string {
  let out = md;

  // Collapse 3+ consecutive newlines → 2
  out = out.replace(/\n{3,}/g, "\n\n");

  // Trim trailing whitespace per line
  out = out
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");

  // Ensure headings have a blank line before them
  out = out.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");

  // Trim document, ensure exactly one trailing newline
  out = out.trim();
  out += "\n";

  return out;
}
