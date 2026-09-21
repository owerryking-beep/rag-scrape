// Embeds landing/index.html into the worker bundle as a TS string module.
// Run from the worker/ directory BEFORE deploying:
//   node scripts/embed-landing.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync(new URL("../../landing/index.html", import.meta.url), "utf8");
const outDir = new URL("../src/generated/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("landing-html.ts", outDir),
  "// AUTO-GENERATED from landing/index.html — do not edit by hand.\n" +
    "// Regenerate with: node scripts/embed-landing.mjs\n" +
    `export const LANDING_HTML = ${JSON.stringify(html)};\n`,
);
console.log(`Embedded landing page (${html.length} bytes) into src/generated/landing-html.ts`);
