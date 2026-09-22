#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, type RegisterResponse } from "./config.js";
import { scrapeUrl, registerEmail, crawlSite } from "./client.js";
import { runMcpServer } from "./mcp.js";

const program = new Command();

// The main command and the subcommands both define --base-url. Without
// positional options, commander lets the PARENT's option parser claim -b
// wherever it appears in argv, silently starving the subcommand's options.
// Positional parsing scopes each command's options to its own segment.
program.enablePositionalOptions();

// ── helpers ──────────────────────────────────────────────────────────────────

interface CommonOpts {
  apiKey?: string;
  baseUrl?: string;
}

function resolveBaseUrl(opts: CommonOpts): string {
  return (opts.baseUrl ?? CONFIG.API_BASE_URL).replace(/\/+$/, "");
}

function resolveKey(opts: CommonOpts): string {
  return opts.apiKey ?? process.env.RAG_SCRAPE_API_KEY ?? CONFIG.DEMO_API_KEY;
}

function isDemoKey(key: string): boolean {
  return key === CONFIG.DEMO_API_KEY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function yamlEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

/** Derive a safe `<domain>.md` style filename from a URL. */
function fileNameForUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/[^a-zA-Z0-9.\-]/g, "_") + ".md";
  } catch {
    return "unknown.md";
  }
}

// ── main command ─────────────────────────────────────────────────────────────

program
  .name("rag-scrape")
  .description("Convert any URL to clean Markdown")
  .version(CONFIG.VERSION)
  .argument("<url>", "URL to convert")
  .option("-k, --api-key <key>", "API key (falls back to $RAG_SCRAPE_API_KEY, then the demo key)")
  .option("-b, --base-url <url>", "API base URL (for self-hosted / local dev)")
  .option("-o, --output <file>", "Save to file instead of stdout")
  .option("-m, --metadata", "Prepend YAML front-matter", false)
  .option("-j, --json", "Output raw JSON", false)
  .option("-q, --quiet", "No spinner / info on stderr", false)
  .action(
    async (
      url: string,
      opts: {
        apiKey?: string;
        baseUrl?: string;
        output?: string;
        metadata?: boolean;
        json?: boolean;
        quiet?: boolean;
      },
    ) => {
      const apiKey = resolveKey(opts);
      const baseUrl = resolveBaseUrl(opts);
      const isDemo = isDemoKey(apiKey);

      if (isDemo && !opts.quiet) {
        process.stderr.write(
          chalk.yellow(
            "⚠  Using the shared demo key (5 requests/IP). Set --api-key or RAG_SCRAPE_API_KEY.\n",
          ),
        );
        process.stderr.write(
          chalk.dim("   Free key:  npx rag-scrape register <email>\n\n"),
        );
      }

      const spinner = opts.quiet
        ? null
        : ora({ text: `Scraping ${chalk.cyan(url)}…`, stream: process.stderr }).start();

      const result = await scrapeUrl(url, apiKey, baseUrl);

      if (!result.success) {
        spinner?.fail(chalk.red("Failed"));
        process.stderr.write(
          chalk.red(`\nError [${result.error.code}]: ${result.error.message}\n`),
        );
        if (result.error.details) {
          process.stderr.write(chalk.dim(`Details: ${result.error.details}\n`));
        }
        process.exit(1);
      }

      spinner?.succeed(chalk.green(`Done (${result.metadata.wordCount} words)`));

      if (opts.json) {
        const out = JSON.stringify(result, null, 2);
        if (opts.output) {
          await writeFile(opts.output, out, "utf-8");
          process.stderr.write(chalk.green(`✓ Saved to ${opts.output}\n`));
        } else {
          process.stdout.write(out + "\n");
        }
        return;
      }

      let out = "";
      if (opts.metadata) {
        out += "---\n";
        out += `title: "${yamlEscape(result.metadata.title)}"\n`;
        out += `source: "${yamlEscape(result.metadata.sourceUrl)}"\n`;
        out += `scraped_at: "${result.metadata.scrapedAt}"\n`;
        if (result.metadata.byline)
          out += `author: "${yamlEscape(result.metadata.byline)}"\n`;
        if (result.metadata.siteName)
          out += `site: "${yamlEscape(result.metadata.siteName)}"\n`;
        out += `word_count: ${result.metadata.wordCount}\n`;
        out += "---\n\n";
      }
      out += result.markdown;

      if (opts.output) {
        await writeFile(opts.output, out, "utf-8");
        process.stderr.write(chalk.green(`✓ Saved to ${opts.output}\n`));
      } else {
        process.stdout.write(out);
      }
    },
  );

// ── register ─────────────────────────────────────────────────────────────────

program
  .command("register <email>")
  .description("Get a free API key (50 reqs/mo)")
  .option("-b, --base-url <url>", "API base URL")
  .action(async (email: string, opts: CommonOpts) => {
    const spinner = ora("Registering…").start();

    try {
      const data = await registerEmail(email, resolveBaseUrl(opts));

      if (!data.success || !data.apiKey) {
        spinner.fail(chalk.red("Registration failed"));
        process.stderr.write(chalk.red(data.error?.message ?? "Unknown error") + "\n");
        process.exit(1);
      }

      spinner.succeed(chalk.green("Registered!"));
      console.log("");
      console.log(chalk.bold("Your API Key:"));
      console.log(chalk.cyan(`  ${data.apiKey}`));
      console.log("");
      console.log(chalk.dim("Set it permanently:"));
      console.log(chalk.dim(`  export RAG_SCRAPE_API_KEY="${data.apiKey}"`));
      console.log("");
      console.log(
        chalk.dim(`Free tier: ${data.limit} reqs/mo. Upgrade → https://rag-scrape-api.owerryking.workers.dev`),
      );
    } catch (err) {
      spinner.fail(chalk.red("Registration failed"));
      process.stderr.write(
        chalk.red(err instanceof Error ? err.message : "Network error") + "\n",
      );
      process.exit(1);
    }
  });

// ── batch ────────────────────────────────────────────────────────────────────

program
  .command("batch <file>")
  .description("Process URLs from a text file (one per line, # comments allowed)")
  .option("-k, --api-key <key>", "API key")
  .option("-b, --base-url <url>", "API base URL")
  .option("-d, --output-dir <dir>", "Output directory", "./output")
  .option("--delay <ms>", "Delay between requests (ms)", "1000")
  .option("-q, --quiet", "No spinner / info output", false)
  .action(
    async (
      file: string,
      opts: { apiKey?: string; baseUrl?: string; outputDir: string; delay: string; quiet?: boolean },
    ) => {
      const apiKey = resolveKey(opts);
      const baseUrl = resolveBaseUrl(opts);
      const delay = parseInt(opts.delay, 10) || 1000;
      const quiet = !!opts.quiet;

      let lines: string[];
      try {
        const raw = await readFile(file, "utf-8");
        lines = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
      } catch {
        process.stderr.write(chalk.red(`Cannot read file: ${file}\n`));
        process.exit(1);
      }

      if (lines.length === 0) {
        process.stderr.write(chalk.red("No URLs found.\n"));
        process.exit(1);
      }

      if (!existsSync(opts.outputDir)) {
        await mkdir(opts.outputDir, { recursive: true });
      }

      if (!quiet) console.log(chalk.bold(`Processing ${lines.length} URLs…\n`));
      let ok = 0;
      let fail = 0;

      for (let i = 0; i < lines.length; i++) {
        const url = lines[i]!;
        const spinner = quiet ? null : ora(`[${i + 1}/${lines.length}] ${url}`).start();

        const result = await scrapeUrl(url, apiKey, baseUrl);

        if (result.success) {
          const filename = fileNameForUrl(url);
          const filepath = join(opts.outputDir, filename);

          let content = "---\n";
          content += `title: "${yamlEscape(result.metadata.title)}"\n`;
          content += `source: "${yamlEscape(url)}"\n`;
          content += `scraped_at: "${result.metadata.scrapedAt}"\n`;
          content += `word_count: ${result.metadata.wordCount}\n`;
          content += "---\n\n";
          content += result.markdown;

          await writeFile(filepath, content, "utf-8");
          spinner?.succeed(chalk.green(`[${i + 1}/${lines.length}] ${filename}`));
          ok++;
        } else {
          spinner?.fail(
            chalk.red(`[${i + 1}/${lines.length}] ${url}: ${result.error.message}`),
          );
          if (quiet) process.stderr.write(`${url}: ${result.error.message}\n`);
          fail++;
        }

        if (i < lines.length - 1) await sleep(delay);
      }

      if (!quiet) {
        console.log("");
        console.log(chalk.bold("Results:"));
        console.log(chalk.green(`  ✓ ${ok} succeeded`));
        if (fail > 0) console.log(chalk.red(`  ✗ ${fail} failed`));
        console.log(chalk.dim(`  Output: ${opts.outputDir}/`));
      }

      if (fail === lines.length) process.exit(1);
    },
  );


// ── crawl (docs-site → Markdown files + llms.txt) ────────────────────────────

program
  .command("crawl <url>")
  .description("Crawl a docs site (same-host) and save every page as Markdown + llms.txt. Each page costs 1 request.")
  .option("-k, --api-key <key>", "API key (falls back to RAG_SCRAPE_API_KEY)")
  .option("-b, --base-url <url>", "Override the API base URL")
  .option("-n, --max-pages <n>", "Max pages to crawl (1–100, default 20)", "20")
  .option("-d, --output-dir <dir>", "Output directory", "./crawled-docs")
  .option("--include <prefixes>", "Comma-separated path prefixes to include (e.g. /docs,/reference)")
  .option("--exclude <prefixes>", "Comma-separated path prefixes to exclude")
  .option("--llms-txt", "Only print llms.txt to stdout (files are also written unless --quiet)", false)
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (url: string, opts: {
    apiKey?: string; baseUrl?: string; maxPages: string; outputDir: string;
    include?: string; exclude?: string; llmsTxt: boolean; quiet: boolean;
  }) => {
    const apiKey = opts.apiKey ?? process.env.RAG_SCRAPE_API_KEY ?? CONFIG.DEMO_API_KEY;
    const baseUrl = resolveBaseUrl(opts);
    if (isDemoKey(apiKey)) {
      console.log(chalk.yellow("⚠  Crawling requires a registered key (free: 50/mo)."));
      console.log(chalk.dim("   npx rag-scrape register <email>"));
      process.exitCode = 1;
      return;
    }

    const maxPages = Math.max(1, Math.min(100, parseInt(opts.maxPages, 10) || 20));
    const spin = opts.quiet ? null : ora(`Crawling ${url} (up to ${maxPages} pages)…`).start();
    const res = await crawlSite(url, apiKey, baseUrl, {
      maxPages,
      includePaths: opts.include ? opts.include.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      excludePaths: opts.exclude ? opts.exclude.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });

    if (!res.success || !res.pages) {
      spin?.fail();
      const e = res.error ?? { code: "UNKNOWN", message: "Crawl failed." };
      console.error(chalk.red(`✗ ${e.code}: ${e.message}`));
      process.exitCode = 1;
      return;
    }
    spin?.succeed(`Crawled ${res.stats?.crawled ?? res.pages.length} pages`);

    const safeName = (pageUrl: string, i: number): string => {
      try {
        const u = new URL(pageUrl);
        const seg = (u.pathname === "/" ? "index" : u.pathname.replace(/\/+$/, "").split("/").pop() ?? `page-${i}`)
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(0, 60) || `page-${i}`;
        return `${u.hostname.replace(/[^a-zA-Z0-9.-]/g, "_")}/${seg}.md`;
      } catch {
        return `page-${i}.md`;
      }
    };

    await mkdir(opts.outputDir, { recursive: true });
    for (let i = 0; i < res.pages.length; i++) {
      const p = res.pages[i]!;
      const rel = safeName(p.url, i);
      const abs = join(opts.outputDir, rel);
      await mkdir(abs.substring(0, abs.lastIndexOf("/")), { recursive: true });
      const frontMatter = `---\ntitle: "${yamlEscape(p.title)}"\nsource: "${p.url}"\nwords: ${p.wordCount}\n---\n\n`;
      await writeFile(abs, frontMatter + p.markdown + "\n", "utf8");
      if (!opts.quiet) console.log(chalk.green("  ✔ ") + rel + chalk.dim(` (${p.wordCount} words)`));
    }
    await writeFile(join(opts.outputDir, "llms.txt"), res.llmsTxt ?? "", "utf8");
    if (!opts.quiet) console.log(chalk.green("  ✔ ") + "llms.txt");
    if (res.stats && res.stats.failed > 0 && !opts.quiet) {
      console.log(chalk.yellow(`  ⚠ ${res.stats.failed} pages failed`));
    }
    if (opts.llmsTxt) console.log("\n" + (res.llmsTxt ?? ""));
  });

// ── mcp (Model Context Protocol stdio server) ────────────────────────────────

program
  .command("mcp")
  .description("Run RagScrape as an MCP stdio server (for Claude Desktop / agents). Tools: rag_scrape, rag_crawl.")
  .option("-k, --api-key <key>", "API key (falls back to RAG_SCRAPE_API_KEY)")
  .option("-b, --base-url <url>", "Override the API base URL")
  .action(async (opts: { apiKey?: string; baseUrl?: string }) => {
    const apiKey = opts.apiKey ?? process.env.RAG_SCRAPE_API_KEY ?? CONFIG.DEMO_API_KEY;
    const baseUrl = resolveBaseUrl(opts);
    await runMcpServer(apiKey, baseUrl);
  });

program.parse();
