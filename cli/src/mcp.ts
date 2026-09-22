/**
 * MCP (Model Context Protocol) stdio server for RagScrape.
 *
 * Lets any MCP client (Claude Desktop, Claude Code, other agent hosts) use
 * RagScrape as a tool. Runs over stdio with newline-delimited JSON-RPC —
 * nothing may write to stdout except protocol messages.
 *
 *   npx rag-scrape mcp --api-key rsk_…
 *
 * Tools:
 *   rag_scrape { url, chunk? }          → Markdown (optionally RAG chunks)
 *   rag_crawl  { url, max_pages?, … }   → docs-site crawl + llms.txt
 */
import { createInterface } from "node:readline";
import { CONFIG } from "./config.js";
import { scrapeUrl, crawlSite } from "./client.js";

interface RpcRequest {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "rag_scrape",
    description:
      "Scrape a public web page and return clean, LLM-ready Markdown. " +
      "Optionally return RAG-ready chunks aligned to headings.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The page URL to scrape." },
        chunk: {
          type: "boolean",
          description: "Also return RAG-ready chunks (default false).",
        },
        chunk_size: {
          type: "number",
          description: "Target max characters per chunk (200–16000, default 4000).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "rag_crawl",
    description:
      "Crawl a documentation site (same-host BFS, max 100 pages) and return " +
      "every page as Markdown plus a ready llms.txt.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Start URL." },
        max_pages: { type: "number", description: "1–100, default 20. Each page = 1 request." },
        include_paths: {
          type: "array",
          items: { type: "string" },
          description: "Only follow path prefixes in this list (e.g. [\"/docs\"]).",
        },
        exclude_paths: {
          type: "array",
          items: { type: "string" },
          description: "Never follow path prefixes in this list.",
        },
      },
      required: ["url"],
    },
  },
];

function textContent(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

export async function runMcpServer(apiKey: string, baseUrl: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });

  const send = (msg: unknown): void => {
    process.stdout.write(JSON.stringify(msg) + "\n");
  };

  const handle = async (req: RpcRequest): Promise<Record<string, unknown> | null> => {
    const method = req.method ?? "";

    if (method.startsWith("notifications/")) return null; // no reply

    switch (method) {
      case "initialize":
        return {
          protocolVersion:
            typeof req.params?.protocolVersion === "string"
              ? (req.params.protocolVersion as string)
              : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "rag-scrape", version: CONFIG.VERSION },
        };

      case "ping":
        return {};

      case "tools/list":
        return { tools: TOOLS };

      case "tools/call": {
        const name = String(req.params?.name ?? "");
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          if (name === "rag_scrape") {
            const url = String(args.url ?? "");
            if (!url) return textContent("Missing required argument: url", true) as unknown as Record<string, unknown>;
            const res = await scrapeUrl(url, apiKey, baseUrl, {
              chunk: args.chunk === true,
              chunkSize: typeof args.chunk_size === "number" ? args.chunk_size : undefined,
            });
            if (!res.success) {
              return textContent(
                `Scrape failed (${res.error.code}): ${res.error.message}`,
                true,
              ) as unknown as Record<string, unknown>;
            }
            let text = `# ${res.metadata.title || url}\n\n${res.markdown}`;
            if (res.chunks?.length) {
              text += `\n\n---\n[RAG chunks: ${res.chunks.length}]`;
              for (const c of res.chunks) {
                text += `\n\n[chunk ${c.index} | ${c.headingPath.join(" > ") || "(top)"} | ${c.charCount} chars]\n${c.content}`;
              }
            }
            return textContent(text) as unknown as Record<string, unknown>;
          }

          if (name === "rag_crawl") {
            const url = String(args.url ?? "");
            if (!url) return textContent("Missing required argument: url", true) as unknown as Record<string, unknown>;
            const res = await crawlSite(url, apiKey, baseUrl, {
              maxPages: typeof args.max_pages === "number" ? args.max_pages : undefined,
              includePaths: Array.isArray(args.include_paths)
                ? (args.include_paths as string[])
                : undefined,
              excludePaths: Array.isArray(args.exclude_paths)
                ? (args.exclude_paths as string[])
                : undefined,
            });
            if (!res.success) {
              return textContent(
                `Crawl failed (${res.error?.code ?? "UNKNOWN"}): ${res.error?.message ?? "unknown"}`,
                true,
              ) as unknown as Record<string, unknown>;
            }
            const crawled = res.pages ?? [];
            const stats = res.stats ?? { crawled: 0, failed: 0, requested: 0 };
            const pages = crawled
              .map((p) => `- [${p.title || p.url}](${p.url}) — ${p.wordCount} words`)
              .join("\n");
            const text =
              `Crawled ${stats.crawled} pages (${stats.failed} failed).\n\n${pages}\n\n` +
              `--- llms.txt ---\n${res.llmsTxt ?? ""}\n` +
              `--- Full page contents follow ---\n\n` +
              crawled.map((p) => `## ${p.url}\n\n${p.markdown}`).join("\n\n");
            return textContent(text) as unknown as Record<string, unknown>;
          }

          return {
            error: { code: -32602, message: `Unknown tool: ${name}` },
          };
        } catch (err) {
          return textContent(
            `Tool error: ${err instanceof Error ? err.message : "unknown"}`,
            true,
          ) as unknown as Record<string, unknown>;
        }
      }

      default:
        if (req.id === undefined || req.id === null) return null;
        return { error: { code: -32601, message: `Method not found: ${method}` } };
    }
  };

  const queue: string[] = [];
  let waiter: ((v: void) => void) | null = null;
  rl.on("line", (line) => {
    queue.push(line);
    waiter?.();
    waiter = null;
  });
  const closed = new Promise<void>((resolve) => rl.on("close", resolve));

  const nextLine = async (): Promise<string | null> => {
    if (queue.length) return queue.shift() ?? null;
    const raced = await Promise.race([
      new Promise<void>((r) => (waiter = r)),
      closed.then(() => "closed" as const),
    ]);
    if (raced === "closed") return null;
    return queue.shift() ?? null;
  };

  for (;;) {
    const line = await nextLine();
    if (line === null) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: RpcRequest;
    try {
      req = JSON.parse(trimmed) as RpcRequest;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    const result = await handle(req);
    if (result === null) continue;

    if (result.error && (result.error as { code: number }).code === -32601) {
      send({ jsonrpc: "2.0", id: req.id ?? null, error: result.error });
    } else if ((result as { isError?: boolean }).isError) {
      send({ jsonrpc: "2.0", id: req.id ?? null, result });
    } else {
      send({ jsonrpc: "2.0", id: req.id ?? null, result });
    }
  }
}
