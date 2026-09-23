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

const convert = readFileSync(new URL("../../tools/convert.html", import.meta.url), "utf8");
writeFileSync(
  new URL("convert-html.ts", outDir),
  "// AUTO-GENERATED from tools/convert.html — do not edit by hand.\n" +
    "// Regenerate with: node scripts/embed-landing.mjs\n" +
    `export const CONVERT_HTML = ${JSON.stringify(convert)};\n`,
);
console.log(`Embedded convert tool (${convert.length} bytes) into src/generated/convert-html.ts`);

const generator = readFileSync(new URL("../../tools/llms-generator.html", import.meta.url), "utf8");
writeFileSync(
  new URL("llms-generator-html.ts", outDir),
  "// AUTO-GENERATED from tools/llms-generator.html — do not edit by hand.\n" +
    "// Regenerate with: node scripts/embed-landing.mjs\n" +
    `export const LLMS_GENERATOR_HTML = ${JSON.stringify(generator)};\n`,
);
console.log(`Embedded llms-txt generator (${generator.length} bytes) into src/generated/llms-generator-html.ts`);
