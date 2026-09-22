/**
 * Same-host crawler for documentation sites.
 *
 * BFS from a start URL, staying on one hostname, with optional path
 * include/exclude prefixes. Each page goes through the exact same
 * Readability → Markdown pipeline as POST /scrape, plus an llms.txt file
 * is generated from everything that was crawled.
 *
 * Scope notes (deliberate v1 trade-offs):
 *  – robots.txt is not fetched (same trade-off most crawl APIs make by
 *    default); the crawler is same-host-only and hard-capped at 100 pages.
 *  – JS-rendered pages are out of scope (the worker has no headless browser).
 */

import { parseHTML } from "linkedom";
import type { ExtractedContent } from "./extractor.js";
import {
  FetchError,
  FETCH_TIMEOUT_MS,
  normalizeUrl,
  assertNotBlocked,
  extractFromHtml,
} from "./extractor.js";
import { countWords, htmlToMarkdown } from "./converter.js";

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Extract same-host, http(s), fragment-free links from raw HTML. */
export function sameHostLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  const { document } = parseHTML(html);

  const anchors = document.querySelectorAll("a[href]") as unknown as Array<{
    getAttribute: (name: string) => string | null;
  }>;
  for (const a of Array.from(anchors)) {
    const raw = a.getAttribute("href");
    if (!raw) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.hostname !== base.hostname) continue;
    resolved.hash = "";
    out.add(resolved.href);
  }
  return [...out];
}

/** Path-prefix filter: include list (if non-empty) AND not in exclude list. */
export function pathAllowed(
  url: string,
  includePrefixes: string[] = [],
  excludePrefixes: string[] = [],
): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  // Accept prefixes with or without a leading slash ("docs" == "/docs").
  const clean = path.replace(/^\/+/, "");
  const norm = (p: string) => p.replace(/^\/+/, "");
  if (excludePrefixes.some((p) => p && clean.startsWith(norm(p)))) return false;
  if (includePrefixes.length && !includePrefixes.some((p) => p && clean.startsWith(norm(p)))) {
    return false;
  }
  return true;
}

export interface LlmsTxtPage {
  url: string;
  title: string;
  excerpt: string | null;
}

/** llms.txt (llmstxt.org spec, "key information" section). */
export function buildLlmsTxt(startUrl: string, pages: LlmsTxtPage[]): string {
  let host = startUrl;
  try {
    host = new URL(startUrl).hostname;
  } catch {
    // keep raw
  }
  const lines: string[] = [
    `# ${host}`,
    "",
    `> ${pages.length} page${pages.length === 1 ? "" : "s"} crawled from ${host} by RagScrape on ${new Date().toISOString().slice(0, 10)}.`,
    "",
  ];
  for (const p of pages) {
    const excerpt = p.excerpt ? `: ${p.excerpt.slice(0, 120).replace(/\n/g, " ")}` : "";
    lines.push(`- [${p.title || p.url}](${p.url})${excerpt}`);
  }
  return lines.join("\n") + "\n";
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "rag-scrape-crawler/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FetchError(`HTTP ${res.status} fetching ${url}`, res.status);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.includes("text/html") && !ct.includes("text/plain")) {
      throw new FetchError(`Unsupported content type: ${ct}`, 415);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new FetchError(`Timed out fetching ${url}`, 504);
    }
    throw new FetchError(`Failed to fetch ${url}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

// ── Crawl ────────────────────────────────────────────────────────────────────

export interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  llmsTxt: string;
  stats: { crawled: number; failed: number; requested: number };
  errors: Array<{ url: string; error: string }>;
}

export interface CrawlOptions {
  maxPages: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export async function crawlSite(startUrlRaw: string, opts: CrawlOptions): Promise<CrawlResult> {
  const startUrl = normalizeUrl(startUrlRaw);
  assertNotBlocked(startUrl);

  const maxPages = Math.max(1, Math.min(100, Math.floor(opts.maxPages)));
  const include = (opts.includePaths ?? []).map((p) => p.trim()).filter(Boolean);
  const exclude = (opts.excludePaths ?? []).map((p) => p.trim()).filter(Boolean);

  const startHost = new URL(startUrl).hostname;
  const visited = new Set<string>([startUrl]);
  const queue: string[] = [startUrl];

  const pages: CrawledPage[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift() as string;

    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      errors.push({
        url,
        error: err instanceof FetchError ? err.message : "fetch failed",
      });
      continue;
    }

    // Harvest links from the raw HTML before extraction narrows the DOM.
    const links = sameHostLinks(html, url)
      .filter((l) => !visited.has(l))
      .filter((l) => new URL(l).hostname === startHost)
      .filter((l) => pathAllowed(l, include, exclude));
    for (const l of links) {
      visited.add(l);
      queue.push(l);
    }

    try {
      const extracted: ExtractedContent = extractFromHtml(html, url);
      const { htmlToMarkdown } = await import("./converter.js");
      const markdown = htmlToMarkdown(extracted.htmlContent, extracted.sourceUrl);
      if (markdown.trim()) {
        pages.push({
          url: extracted.sourceUrl,
          title: extracted.title,
          markdown,
          wordCount: countWords(markdown),
        });
      }
    } catch (err) {
      errors.push({
        url,
        error: err instanceof Error ? err.message : "extraction failed",
      });
    }
  }

  return {
    pages,
    llmsTxt: buildLlmsTxt(startUrl, pages.map((p) => ({ url: p.url, title: p.title, excerpt: null }))),
    stats: { crawled: pages.length, failed: errors.length, requested: maxPages },
    errors: errors.slice(0, 25),
  };
}
