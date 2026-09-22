import test from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, countWords } from "../src/services/converter.js";

const BASE = "https://example.com/blog/rags";

test("renders headings", () => {
  const md = htmlToMarkdown("<h1>One</h1><h2>Two</h2><h3>Three</h3><h6>Six</h6>");
  assert.ok(md.includes("# One"));
  assert.ok(md.includes("## Two"));
  assert.ok(md.includes("### Three"));
  assert.ok(md.includes("###### Six"));
});

test("renders inline formatting", () => {
  const md = htmlToMarkdown(
    "<p>A <strong>bold</strong>, <em>italic</em>, <del>gone</del> and <code>code()</code> part.</p>",
  );
  assert.ok(md.includes("**bold**"));
  assert.ok(md.includes("*italic*"));
  assert.ok(md.includes("~~gone~~"));
  assert.ok(md.includes("`code()`"));
});

test("resolves relative links and images against the base URL", () => {
  const md = htmlToMarkdown(
    '<p><a href="/docs/page">docs</a> and <a href="https://ext.example.com/x">ext</a></p>' +
      '<img src="/img/a.png" alt="A" />',
    BASE,
  );
  assert.ok(md.includes("[docs](https://example.com/docs/page)"), md);
  assert.ok(md.includes("[ext](https://ext.example.com/x)"));
  assert.ok(md.includes("![A](https://example.com/img/a.png)"));
});

test("keeps absolute and special-scheme links untouched", () => {
  const md = htmlToMarkdown(
    '<a href="mailto:x@y.z">mail</a> <a href="https://ext.example.com/p">https</a> <a href="#top">top</a>',
    BASE,
  );
  assert.ok(md.includes("[mail](mailto:x@y.z)"));
  assert.ok(md.includes("[https](https://ext.example.com/p)"));
  assert.ok(md.includes("[top](#top)"));
});

test("resolves protocol-relative URLs", () => {
  const md = htmlToMarkdown('<a href="//cdn.example.com/lib.js">cdn</a>', BASE);
  assert.ok(md.includes("[cdn](https://cdn.example.com/lib.js)"), md);
});

test("renders nested lists with indentation", () => {
  const md = htmlToMarkdown(
    "<ol><li>First<ul><li>Sub one</li><li>Sub two</li></ul></li><li>Second</li></ol>",
  );
  const lines = md.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim() === "1. First");
  assert.ok(firstIdx !== -1, md);
  assert.equal(lines[firstIdx + 1]?.trim(), "- Sub one");
  assert.ok(lines[firstIdx + 1]?.startsWith("  "), "nested item must be indented");
  assert.ok(lines.some((l) => l.trim() === "2. Second"));
});

test("renders tables with escaped pipes", () => {
  const md = htmlToMarkdown(
    "<table><thead><tr><th>A</th><th>B</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>2|3</td></tr></tbody></table>",
  );
  assert.ok(md.includes("| A | B |"), md);
  assert.ok(md.includes("| --- | --- |"));
  assert.ok(md.includes("| 1 | 2\\|3 |"));
});

test("renders fenced code blocks with language", () => {
  const md = htmlToMarkdown('<pre><code class="language-python">print("hi")</code></pre>');
  assert.ok(md.includes('```python\nprint("hi")\n```'), md);
});

test("renders inline code", () => {
  const md = htmlToMarkdown("<p>Run <code>npm install</code> first.</p>");
  assert.ok(md.includes("`npm install`"), md);
});

test("renders blockquotes", () => {
  const md = htmlToMarkdown("<blockquote><p>Quote here</p></blockquote>");
  assert.ok(md.includes("> Quote here"), md);
});

test("drops scripts, styles and svg", () => {
  const md = htmlToMarkdown(
    '<p>ok</p><script>var x = 1;</script><style>.a{color:red}</style><svg><path d="M0 0"/></svg>',
  );
  assert.ok(!md.includes("var x"));
  assert.ok(!md.includes("color:red"));
  assert.ok(!md.includes("<path"));
  assert.ok(md.includes("ok"));
});

test("collapses excessive blank lines and ends with one newline", () => {
  const md = htmlToMarkdown("<p>a</p><p>b</p><div><div><p>c</p></div></div>");
  assert.ok(!md.includes("\n\n\n"), md);
  assert.ok(md.endsWith("\n"));
  assert.ok(!md.endsWith("\n\n"));
});

test("handles hr and br", () => {
  const md = htmlToMarkdown("<p>a</p><hr><p>b</p><p>line1<br>line2</p>");
  assert.ok(md.includes("---"));
  assert.ok(md.includes("line1\nline2"));
});

test("countWords ignores markdown syntax", () => {
  // #, *, [], (), backticks all stripped → Hello world link http://x code
  assert.equal(countWords("# Hello **world** [link](http://x) `code`"), 5);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("one two three"), 3);
});

// ── slimMarkdown + sha256Hex ─────────────────────────────────────────────────
import { slimMarkdown, sha256Hex } from "../src/services/converter.js";

test("slimMarkdown strips images but keeps alt text", () => {
  const md = "Before ![Chart of revenue](/img.png) after.\n";
  assert.equal(
    slimMarkdown(md, { stripImages: true }),
    "Before Chart of revenue after.\n",
  );
});

test("slimMarkdown unwraps links, keeps text", () => {
  const md = "See [the docs](https://e.com/docs) for more.\n";
  assert.equal(slimMarkdown(md, { stripLinks: true }), "See the docs for more.\n");
});

test("slimMarkdown never touches fenced code", () => {
  const md = 'Text [link](a) here.\n\n```js\nconst s = "[x](y)"; // ![](z)\n```\n';
  const out = slimMarkdown(md, { stripLinks: true, stripImages: true });
  assert.ok(out.includes('const s = "[x](y)"; // ![](z)'), "fence preserved verbatim");
  assert.ok(!out.includes("[link](a)"), "link outside fence unwrapped");
});

test("slimMarkdown no-op when no options set", () => {
  const md = "Keep [everything](https://e.com) as-is ![x](y).\n";
  assert.equal(slimMarkdown(md, {}), md);
});

test("sha256Hex is stable and 16 hex chars", async () => {
  const a = await sha256Hex("hello world");
  const b = await sha256Hex("hello world");
  const c = await sha256Hex("hello worlds");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
});
