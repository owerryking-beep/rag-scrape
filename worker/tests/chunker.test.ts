import test from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "../src/services/chunker.js";

const DOC = `# Guide

Intro paragraph with some text.

## Setup

First setup step.

Second setup step with more words to fill the section.

### Local dev

Run the dev server.

## Deploy

Ship it.
`;

test("splits along headings and tracks headingPath", () => {
  const chunks = chunkMarkdown(DOC, 8000);
  assert.ok(chunks.length >= 4);
  const deploy = chunks.find((c) => c.content.startsWith("## Deploy"));
  assert.ok(deploy, "deploy chunk exists");
  assert.deepEqual(deploy.headingPath, ["Guide", "Deploy"]);
  const local = chunks.find((c) => c.headingPath.includes("Local dev"));
  assert.ok(local, "local dev chunk exists");
  assert.deepEqual(local.headingPath, ["Guide", "Setup", "Local dev"]);
});

test("indexes are sequential from zero", () => {
  const chunks = chunkMarkdown(DOC, 8000);
  assert.equal(chunks[0]?.index, 0);
  chunks.forEach((c, i) => assert.equal(c.index, i));
});

test("respects maxChars by splitting large sections", () => {
  const bigSection = "# Title\n\n" + "paragraph line\n".repeat(400);
  const chunks = chunkMarkdown(bigSection, 600);
  assert.ok(chunks.length > 3, `expected several chunks, got ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.charCount <= 700, `chunk too big: ${c.charCount}`);
    assert.deepEqual(c.headingPath, ["Title"]);
  }
});

test("never breaks inside a code fence", () => {
  const md = "# Code\n\nIntro.\n\n\`\`\`js\n" + "console.log('line');\n".repeat(80) + "\`\`\`\n";
  const chunks = chunkMarkdown(md, 500);
  for (const c of chunks) {
    const fences = (c.content.match(/```/g) ?? []).length;
    assert.equal(fences % 2, 0, `unbalanced fences in chunk ${c.index}`);
  }
});

test("empty and tiny inputs produce sane output", () => {
  assert.deepEqual(chunkMarkdown(""), []);
  const one = chunkMarkdown("just a sentence", 4000);
  assert.equal(one.length, 1);
  assert.equal(one[0]?.content, "just a sentence");
  assert.deepEqual(one[0]?.headingPath, []);
});

test("clamps absurd chunkSize values", () => {
  const chunks = chunkMarkdown(DOC, 0); // clamped to 200
  assert.ok(chunks.length > 1);
  const chunks2 = chunkMarkdown(DOC, 99_999); // clamped to 16000
  assert.ok(chunks2.length >= 1);
});

test("charCount matches content length", () => {
  for (const c of chunkMarkdown(DOC, 400)) {
    assert.equal(c.charCount, c.content.length);
  }
});
