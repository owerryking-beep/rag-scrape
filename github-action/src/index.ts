/**
 * RagScrape GitHub Action
 *
 * Reads a file of URLs, calls the RagScrape Worker API for each one, writes
 * the Markdown to output-dir/<domain>.md, and (optionally) commits + pushes
 * the results using plain git via @actions/exec.
 *
 * Uses Node ≥ 18 native fetch — no extra HTTP dependency.
 */

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

interface ApiSuccess {
  success: true;
  markdown: string;
  metadata: {
    title: string;
    byline: string | null;
    siteName: string | null;
    excerpt: string | null;
    wordCount: number;
    sourceUrl: string;
    scrapedAt: string;
    contentLength: number;
  };
}

interface ApiError {
  success: false;
  error: { code: string; message: string; details?: string };
}

type ApiResponse = ApiSuccess | ApiError;

// ── API client ───────────────────────────────────────────────────────────────

async function callApi(
  url: string,
  apiKey: string,
  apiUrl: string,
): Promise<ApiResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "rag-scrape-github-action/1.0.0",
      },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
    return (await res.json()) as ApiResponse;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return {
      success: false,
      error: {
        code: name === "AbortError" || name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
        message:
          err instanceof Error
            ? `${err.message} (Is the API reachable at ${apiUrl}?)`
            : "Unknown error",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Filename helpers ─────────────────────────────────────────────────────────

function shortHash(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 8);
}

/**
 * Spec default is `<domain>.md`; we append the URL path (sanitised) when
 * present so two URLs from the same domain don't overwrite each other.
 * A collision guard (short URL hash) is applied when the same filename
 * would be produced twice in one run.
 */
function toFilename(url: string): string {
  let base: string;
  let pathPart = "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    base = u.hostname;
    if (u.pathname && u.pathname !== "/") {
      pathPart = u.pathname.replace(/^\/|\/$/g, "").replace(/[^a-zA-Z0-9\-]/g, "_");
    }
  } catch {
    base = url.replace(/[^a-zA-Z0-9.\-]/g, "_");
  }

  const name = (pathPart ? `${base}_${pathPart}` : base)
    .substring(0, 200)
    + ".md";
  return name;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"');
}

function buildFrontMatter(
  url: string,
  md: ApiSuccess["metadata"],
): string {
  let content = "---\n";
  content += `title: "${esc(md.title)}"\n`;
  content += `source: "${esc(url)}"\n`;
  content += `scraped_at: "${md.scrapedAt}"\n`;
  if (md.byline) content += `author: "${esc(md.byline)}"\n`;
  if (md.siteName) content += `site: "${esc(md.siteName)}"\n`;
  content += `word_count: ${md.wordCount}\n`;
  content += "---\n\n";
  return content;
}

// ── Git commit ───────────────────────────────────────────────────────────────

async function commitAndPush(
  outputDir: string,
  commitMessage: string,
): Promise<void> {
  await exec.exec("git", [
    "config",
    "--local",
    "user.email",
    "github-actions[bot]@users.noreply.github.com",
  ]);
  await exec.exec("git", [
    "config",
    "--local",
    "user.name",
    "github-actions[bot]",
  ]);
  await exec.exec("git", ["add", outputDir]);

  const rc = await exec.exec("git", ["diff", "--cached", "--quiet"], {
    ignoreReturnCode: true,
  });

  if (rc !== 0) {
    await exec.exec("git", ["commit", "-m", commitMessage]);
    await exec.exec("git", ["push"]);
    core.info("✓ Committed and pushed");
  } else {
    core.info("Nothing changed – skipping commit");
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    // Inputs
    const urlsFile = core.getInput("urls-file", { required: true });
    const outputDir = core.getInput("output-dir") || "scraped-docs";
    const apiKey = core.getInput("api-key", { required: true });
    const commitChanges = core.getInput("commit-changes") !== "false";
    const commitMessage =
      core.getInput("commit-message") ||
      "docs: update scraped markdown [rag-scrape]";
    const delayMs = Math.max(0, parseInt(core.getInput("delay-ms") || "1500", 10));
    const apiUrl =
      core.getInput("api-url") ||
      "https://rag-scrape-api.owerryking.workers.dev";

    // Never echo the secret in logs
    core.setSecret(apiKey);

    // Read URLs
    const absFile = resolve(urlsFile);
    if (!existsSync(absFile)) {
      core.setFailed(`URLs file not found: ${absFile}`);
      return;
    }

    const urls = (await readFile(absFile, "utf-8"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

    if (urls.length === 0) {
      core.setFailed("No URLs found in file.");
      return;
    }

    core.info(`Found ${urls.length} URLs`);

    const outPath = resolve(outputDir);
    if (!existsSync(outPath)) {
      await mkdir(outPath, { recursive: true });
    }

    let created = 0;
    let failed = 0;
    const usedNames = new Set<string>();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      core.info(`[${i + 1}/${urls.length}] ${url}`);

      const result = await callApi(url, apiKey, apiUrl);

      if (result.success) {
        let fname = toFilename(url);
        if (usedNames.has(fname)) {
          fname = fname.replace(/\.md$/, `_${shortHash(url)}.md`);
        }
        usedNames.add(fname);
        const fpath = join(outPath, fname);

        const content = buildFrontMatter(url, result.metadata) + result.markdown;
        await writeFile(fpath, content, "utf-8");
        core.info(`  ✓ ${fname} (${result.metadata.wordCount} words)`);
        created++;
      } else {
        core.warning(`  ✗ ${result.error.message}`);
        failed++;
      }

      if (i < urls.length - 1 && delayMs > 0) await sleep(delayMs);
    }

    // Outputs
    core.info("");
    core.info(`=== Done: ${created} created, ${failed} failed ===`);
    core.setOutput("files-created", String(created));
    core.setOutput("files-failed", String(failed));
    core.setOutput("output-directory", outputDir);

    if (created === 0) {
      core.warning("No files created. Check URLs & API key.");
      return;
    }

    // Git commit
    if (commitChanges) {
      core.info("Committing…");
      try {
        await commitAndPush(outputDir, commitMessage);
      } catch (err) {
        core.warning(
          `Git push failed: ${err instanceof Error ? err.message : err}. ` +
            "Ensure the workflow has 'contents: write' permission.",
        );
      }
    }
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : "Unexpected error");
  }
}

run();
