import test from "node:test";
import assert from "node:assert/strict";
import { sameHostLinks, pathAllowed, buildLlmsTxt } from "../src/services/crawler.js";

test("sameHostLinks: keeps only same-host http(s) links, drops fragments", () => {
  const html = `
    <a href="/docs/intro">intro</a>
    <a href="https://other.com/page">other</a>
    <a href="mailto:a@b.com">mail</a>
    <a href="javascript:void(0)">js</a>
    <a href="/docs/intro#section">frag</a>
    <a href="../api/ref">rel</a>
    <a href="https://example.com:8080/port">port</a>
    <a>no href</a>
  `;
  const links = sameHostLinks(html, "https://example.com/docs/start");
  assert.deepEqual(links.sort(), [
    "https://example.com/api/ref",
    "https://example.com/docs/intro",
    "https://example.com:8080/port",
  ].sort());
});

test("sameHostLinks: tolerates garbage hrefs", () => {
  const links = sameHostLinks('<a href="::::">x</a><a href="%">y</a>', "https://e.com");
  assert.ok(Array.isArray(links));
});

test("pathAllowed: include prefixes act as an allow-list", () => {
  assert.equal(pathAllowed("https://e.com/docs/a", ["docs"]), true);
  assert.equal(pathAllowed("https://e.com/blog/x", ["docs"]), false);
  assert.equal(pathAllowed("https://e.com/docs", ["docs"]), true); // prefix match
});

test("pathAllowed: exclude prefixes win", () => {
  assert.equal(pathAllowed("https://e.com/docs/old/page", [], ["docs/old"]), false);
  assert.equal(pathAllowed("https://e.com/docs/new", ["docs"], ["docs/old"]), true);
});

test("pathAllowed: no filters means everything passes", () => {
  assert.equal(pathAllowed("https://e.com/anything", [], []), true);
});

test("buildLlmsTxt: llmstxt.org shape", () => {
  const txt = buildLlmsTxt("https://docs.example.com/guide", [
    { url: "https://docs.example.com/guide", title: "Guide", excerpt: "How to use" },
    { url: "https://docs.example.com/api", title: "API", excerpt: null },
  ]);
  assert.match(txt, /^# docs\.example\.com\n/);
  assert.match(txt, /> 2 pages crawled from docs\.example\.com by RagScrape/);
  assert.match(txt, /- \[Guide\]\(https:\/\/docs\.example\.com\/guide\): How to use/);
  assert.match(txt, /- \[API\]\(https:\/\/docs\.example\.com\/api\)\n$/);
  assert.ok(txt.endsWith("\n"));
});
