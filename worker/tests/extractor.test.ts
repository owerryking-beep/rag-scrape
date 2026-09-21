import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  normalizeUrl,
  assertNotBlocked,
  FetchError,
  extractFromHtml,
} from "../src/services/extractor.js";
import { htmlToMarkdown } from "../src/services/converter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, "fixtures", "article.html"), "utf-8");
const SOURCE = "https://example.com/blog/rags";

test("normalizeUrl adds https:// and keeps valid URLs", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(normalizeUrl("example.com/a/b?c=d"), "https://example.com/a/b?c=d");
  assert.equal(normalizeUrl("http://example.com/a?b=1"), "http://example.com/a?b=1");
  assert.equal(normalizeUrl("  https://example.com  "), "https://example.com/");
});

test("normalizeUrl rejects non-http(s) and invalid input", () => {
  assert.throws(() => normalizeUrl("file:///etc/passwd"), FetchError);
  assert.throws(() => normalizeUrl("ftp://example.com/x"), FetchError);
  assert.throws(() => normalizeUrl("mailto:a@b.c"), FetchError);
  assert.throws(() => normalizeUrl("data:text/html,hi"), FetchError);
  assert.throws(() => normalizeUrl(""), FetchError);
  assert.throws(() => normalizeUrl("not a url with spaces"), FetchError);
});

test("assertNotBlocked rejects internal/private addresses", () => {
  assert.doesNotThrow(() => assertNotBlocked("https://example.com/"));
  assert.doesNotThrow(() => assertNotBlocked("https://sub.domain.co.uk/x"));
  for (const bad of [
    "https://127.0.0.1:8787/",
    "http://localhost:3000/",
    "http://10.1.2.3/",
    "http://192.168.0.10/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
    "https://[::1]/",
    "file:///etc/passwd",
  ]) {
    assert.throws(() => assertNotBlocked(bad), FetchError, `should block ${bad}`);
  }
});

test("extractFromHtml pulls the readable article out of a full page", () => {
  const out = extractFromHtml(fixture, SOURCE);

  assert.ok(out.title.includes("Understanding RAG Pipelines"), out.title);
  assert.equal(out.siteName, "TestSite");
  assert.ok(out.byline?.includes("Jane Doe"), `byline: ${out.byline}`);
  assert.ok(out.length > 200, `extracted length too small: ${out.length}`);
  assert.ok(out.textContent.includes("vector database"));
  assert.ok(out.sourceUrl === SOURCE);

  const md = htmlToMarkdown(out.htmlContent, out.sourceUrl);

  // Structure — Readability consumes the article <h1> as the title, so the
  // heading may legitimately be absent from the content itself.
  if (md.includes("Understanding RAG Pipelines")) {
    assert.ok(
      md.includes("# Understanding RAG Pipelines") ||
        md.includes("## Understanding RAG Pipelines"),
      md,
    );
  }
  assert.ok(md.includes("## How it works"));
  assert.ok(md.includes("## Key components"));

  // Links: absolute preserved, relative resolved against source URL
  assert.ok(md.includes("[absolute link](https://external.example.com/page)"), md);
  assert.ok(
    md.includes("[a relative link](https://example.com/blog/links)"),
    "relative link should be absolutised: " + md,
  );

  // Images resolved
  assert.ok(md.includes("![RAG pipeline diagram](https://example.com/img/pipeline.png)"), md);

  // Table
  assert.ok(md.includes("| Component | Role |"), md);
  assert.ok(md.includes("| Embedder | Turns text into vectors |"));

  // Code
  assert.ok(md.includes("```python"), md);
  assert.ok(md.includes("def chunk(text, size=512):"), md);
  assert.ok(md.includes("`npm install rag-scrape`"), md);

  // Blockquote
  assert.ok(md.includes("> RAG gives LLMs access to private knowledge."), md);

  // Lists
  assert.ok(md.includes("1. Chunk the document"), md);
  assert.ok(md.includes("- By tokens"), md);
  assert.ok(md.includes("3. Retrieve at query time"), md);

  // Noise removed
  assert.ok(!md.includes("Buy stuff now"), "ad content leaked");
  assert.ok(!md.includes("tracking noise"), "script content leaked");
  assert.ok(!md.includes("user comment noise"), "comments leaked");
  assert.ok(!md.includes("All rights reserved"), "footer leaked");
  assert.ok(!md.includes("Pricing"), "nav leaked");
});

test("extractFromHtml throws FetchError(422) for empty/non-article HTML", () => {
  assert.throws(
    () => extractFromHtml("<!DOCTYPE html><html><head></head><body></body></html>", SOURCE),
    (err: unknown) => err instanceof FetchError && err.statusCode === 422,
  );
});
