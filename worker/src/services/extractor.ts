/**
 * Fetches a URL and extracts the main readable content using
 * Mozilla Readability on top of linkedom's DOM implementation.
 *
 * Workers notes:
 *  – linkedom is the DOM. It is isomorphic and works under
 *    `nodejs_compat` (wrangler.toml).
 *  – Readability sniffs the global `document` in a few places. We set it
 *    from the linkedom document and restore it synchronously right after
 *    `parse()` — `parse()` itself is synchronous, so two concurrent
 *    requests in the same isolate can never observe each other's document.
 *  – A `<base href>` tag is injected before parsing so Readability's
 *    `_fixRelativeUris` can absolutise `<a href>` / `<img src>` against the
 *    source page. The converter resolves any stragglers as well.
 */

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import type { DomDocument, DomElement, DomNode } from "./dom.js";

export interface ExtractedContent {
  title: string;
  htmlContent: string;
  textContent: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  /** Length of the extracted text in characters (Readability metric). */
  length: number;
  sourceUrl: string;
}

export class FetchError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "FetchError";
    this.statusCode = statusCode;
  }
}

export const FETCH_TIMEOUT_MS = 15_000;

// ── URL helpers ──────────────────────────────────────────────────────────────

/**
 * SSRF guard. Blocks localhost / RFC1918 ranges / link-local / IPv6 literals
 * and non-HTTP schemes. (A public domain that *resolves* to a private IP via
 * DNS rebinding is not caught here — Workers has no post-resolution hook
 * before fetch; see README "Known limitations".)
 */
const BLOCKED_URL_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/localhost\b/i,
  /^https?:\/\/127\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/169\.254\.\d{1,3}\.\d{1,3}/, // link-local / cloud metadata
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/\[/, // IPv6 literal
  /^file:/i,
  /^ftp:/i,
  /^data:/i,
  /^gopher:/i,
  /^dict:/i,
  /^ws:/i,
  /^wss:/i,
];

/**
 * Normalises user input into an absolute http(s) URL.
 * Throws FetchError(400) on anything that is not a valid http(s) URL.
 */
export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) throw new FetchError("URL must not be empty.", 400);
  // Bare scheme (e.g. "mailto:x") is left to the protocol check below;
  // only scheme-less input gets the https:// prefix.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    url = `https://${url}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError(`Invalid URL: ${raw}`, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchError(`Unsupported protocol: ${parsed.protocol}`, 400);
  }
  return parsed.toString();
}

export function assertNotBlocked(url: string): void {
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) {
      throw new FetchError(
        "This URL targets an internal/private address or an unsupported protocol and is blocked.",
        403,
      );
    }
  }
}

// ── Noise removal ────────────────────────────────────────────────────────────

/**
 * Elements we drop before Readability runs. Deliberately conservative:
 * Readability already scores and drops most chrome; pre-removing `<header>`
 * for example would also destroy bylines, so it is left to Readability.
 */
const REMOVE_SELECTORS: readonly string[] = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "nav",
  "footer",
  "form",
  ".ad",
  ".ads",
  ".ad-container",
  ".ad-wrapper",
  ".advertisement",
  ".adsbygoogle",
  ".social-share",
  ".share-buttons",
  ".comments",
  ".comment-section",
  "#comments",
  ".sidebar",
  ".cookie-banner",
  ".newsletter-signup",
  ".popup",
  ".modal",
];

function stripNoise(doc: DomDocument): void {
  for (const selector of REMOVE_SELECTORS) {
    try {
      for (const node of Array.from(doc.querySelectorAll(selector))) {
        node.remove();
      }
    } catch {
      // linkedom may not support every selector — skip silently
    }
  }
}

function fallbackTitle(doc: DomDocument): string {
  const titleEl = doc.querySelector("title");
  const titleText = titleEl?.textContent?.trim();
  if (titleText) return titleText;

  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const ogContent = ogTitle?.getAttribute("content")?.trim();
  if (ogContent) return ogContent;

  const h1 = doc.querySelector("h1");
  const h1Text = h1?.textContent?.trim();
  if (h1Text) return h1Text;

  return "Untitled";
}

/**
 * Injects `<base href="sourceUrl">` so Readability can absolutise relative
 * links/images via the document's baseURI.
 */
function anchorBaseUrl(doc: DomDocument, sourceUrl: string): void {
  try {
    const base = doc.createElement("base");
    base.setAttribute("href", sourceUrl);
    const head = doc.head;
    if (head) {
      head.insertBefore(base, head.firstChild);
    }
  } catch {
    // Non-fatal: the converter resolves remaining relative URLs itself.
  }
}

// ── Main extraction ──────────────────────────────────────────────────────────

/**
 * Parses raw HTML and extracts the main article.
 * Exported separately from fetching so it is unit-testable without network.
 */
export function extractFromHtml(html: string, sourceUrl: string): ExtractedContent {
  const { document } = parseHTML(html);
  const doc = document as unknown as DomDocument;

  anchorBaseUrl(doc, sourceUrl);
  stripNoise(doc);

  // Readability's typings reference the browser `Document` global, which does
  // not exist in the Workers type environment. linkedom's document provides
  // every member Readability touches at runtime, so the structural cast is
  // safe — the runtime check is the test suite.
  const reader = new Readability(
    doc as unknown as ConstructorParameters<typeof Readability>[0],
    {
      charThreshold: 50,
      // Keep classes so code-block language hints (language-*) survive to the
      // converter; they never leak into the Markdown output itself.
      keepClasses: true,
      nbTopCandidates: 5,
    },
  );

  // Readability sniffs the global `document` in a couple of places. Set and
  // restore synchronously around parse() — parse() has no awaits, so two
  // concurrent requests in the same isolate can't observe each other's doc.
  const g = globalThis as Record<string, unknown>;
  const previousDocument = g.document;
  g.document = doc;

  let article: NonNullable<ReturnType<Readability["parse"]>> | null;
  try {
    article = reader.parse();
  } finally {
    if (previousDocument === undefined) delete g.document;
    else g.document = previousDocument;
  }

  if (!article || !article.content?.trim()) {
    throw new FetchError(
      "Could not extract readable content. The page may be too dynamic or lack article structure.",
      422,
    );
  }

  return {
    title: article.title?.trim() || fallbackTitle(doc),
    htmlContent: article.content,
    textContent: article.textContent ?? "",
    byline: article.byline?.trim() ? article.byline.trim() : null,
    siteName: article.siteName?.trim() ? article.siteName.trim() : null,
    excerpt: article.excerpt?.trim() ? article.excerpt.trim() : null,
    length: article.length,
    sourceUrl,
  };
}

// ── Fetching ─────────────────────────────────────────────────────────────────

function fetchTimeoutSignal(): AbortSignal {
  // AbortSignal.timeout exists in the Workers runtime and Node ≥ 17.3;
  // the fallback keeps the helper portable for tests.
  const staticTimeout = (
    AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }
  ).timeout;
  if (typeof staticTimeout === "function") {
    return staticTimeout.call(AbortSignal, FETCH_TIMEOUT_MS);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const maybeTimer = timer as unknown as { unref?: () => void };
  maybeTimer.unref?.();
  return controller.signal;
}

async function fetchHtml(url: string): Promise<string> {
  const normalised = normalizeUrl(url);
  assertNotBlocked(normalised);

  let response: Response;
  try {
    response = await fetch(normalised, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RagScrapeBot/1.0; +https://ragscrape.dev/bot)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: fetchTimeoutSignal(),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new FetchError(
        `The target URL did not respond within ${FETCH_TIMEOUT_MS / 1000} seconds.`,
        504,
      );
    }
    throw new FetchError(
      `Could not reach the target URL: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502,
    );
  }

  if (!response.ok) {
    throw new FetchError(
      `Target returned HTTP ${response.status} ${response.statusText || "(no status text)"}`.trimEnd(),
      response.status,
    );
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new FetchError("Received an empty HTML response from the URL.", 422);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  // Some servers omit the content-type entirely — sniff in that case only.
  const looksLikeHtml = /^\s*(<!doctype html|<html[\s>])/i.test(html);
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml") &&
    !looksLikeHtml
  ) {
    throw new FetchError(
      `Unsupported content-type "${contentType}". Only HTML pages are supported.`,
      415,
    );
  }

  return html;
}

/**
 * Full pipeline: fetch → noise-strip → Readability extraction.
 */
export async function fetchAndExtract(url: string): Promise<ExtractedContent> {
  const normalised = normalizeUrl(url); // validate up front
  const html = await fetchHtml(normalised);
  return extractFromHtml(html, normalised);
}
