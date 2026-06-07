#!/usr/bin/env node
/*
 * V6 Data Ingestion Service
 *
 * This module implements the ingestion pipeline described in
 * docs/architecture/v6-data-ingestion-contract.md.  Its goal is to
 * reproducibly clone or read a target repository/directory, normalise
 * its contents, run security/quality analyses and persist embeddings
 * into a local vector database.  The code is designed to run inside
 * Docker on Windows 10/11 with no global dependencies.  External
 * libraries are imported lazily; if a module is unavailable the
 * relevant step is skipped and a warning is logged.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

// Attempt to import optional dependencies.  These imports are wrapped in
// try/catch blocks so that the script still runs when a dependency is
// missing.  Real deployments should include the libraries listed in
// the V6 Data Ingestion Contract.
let Octokit: any;
let git: any;
let http: any;
let axios: any;
let cheerio: any;
let micromatch: any;
let lancedb: any;
let langchain: any;
let localforage: any;
let chokidar: any;
let winston: any;
let validator: any;
let dotenv: any;

function lazyLoad() {
  try {
    // Git & GitHub clients
    Octokit = require("@octokit/core").Octokit;
  } catch (err) {
    console.warn("@octokit/core not found; GitHub API features disabled");
  }
  try {
    git = require("isomorphic-git");
    http = require("isomorphic-git/http/node");
  } catch (err) {
    console.warn("isomorphic-git not found; cloning disabled");
  }
  try {
    axios = require("axios");
  } catch (err) {
    console.warn("axios not found; remote fetching disabled");
  }
  try {
    cheerio = require("cheerio");
  } catch (err) {
    console.warn("cheerio not found; HTML parsing disabled");
  }
  try {
    micromatch = require("micromatch");
  } catch (err) {
    console.warn("micromatch not found; glob filtering disabled");
  }
  try {
    // Note: lancedb exports vary by version; we attempt both
    lancedb = require("@lancedb/node") || require("lancedb");
  } catch (err) {
    console.warn("lancedb not found; vector storage disabled");
  }
  try {
    langchain = require("langchain");
  } catch (err) {
    console.warn("langchain not found; document chunking disabled");
  }
  try {
    localforage = require("localforage");
  } catch (err) {
    console.warn("localforage not found; local cache disabled");
  }
  try {
    chokidar = require("chokidar");
  } catch (err) {
    console.warn("chokidar not found; watch mode disabled");
  }
  try {
    winston = require("winston");
  } catch (err) {
    console.warn("winston not found; logging disabled");
  }
  try {
    validator = require("validator");
  } catch (err) {
    console.warn("validator.js not found; input validation disabled");
  }
  try {
    dotenv = require("dotenv");
    dotenv.config();
  } catch (err) {
    // optional; no warning
  }
}

// Load optional dependencies at module load time
lazyLoad();

/**
 * Configuration for the ingestion run.
 */
export interface IngestionConfig {
  /** GitHub or Git URL to clone */
  repoUrl?: string;
  /** Path to a local directory */
  localDir?: string;
  /** If true, watch for file changes */
  watch?: boolean;
  /** Optional output directory; defaults to `.pala/ingest-temp` */
  outDir?: string;
}

/**
 * Clone a remote repository into a local directory using isomorphic-git.  If
 * isomorphic-git is not available, the function throws.
 */
async function cloneRepo(url: string, dir: string) {
  if (!git || !http) {
    throw new Error("isomorphic-git is not installed");
  }
  await fs.mkdir(dir, { recursive: true });
  await git.clone({ fs, http, dir, url, singleBranch: true, depth: 1 });
}

/**
 * Read the contents of a local directory (recursively) and process each file.
 */
async function ingestDirectory(root: string, processFn: (file: string) => Promise<void>) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await ingestDirectory(fullPath, processFn);
      continue;
    }
    if (shouldIgnore(fullPath)) {
      continue;
    }
    await processFn(fullPath);
  }
}

/**
 * Determine whether to ignore a file based on glob patterns.  Uses micromatch if
 * available; otherwise returns false.
 */
function shouldIgnore(filePath: string): boolean {
  const ignorePatterns = ["**/node_modules/**", "**/.git/**", "**/.pala/**"];
  if (micromatch) {
    return micromatch.isMatch(filePath, ignorePatterns);
  }
  // simple fallback: ignore node_modules and .git
  return filePath.includes("node_modules") || filePath.includes(".git") || filePath.includes(".pala");
}

/**
 * Process a single file: parse content, run static analysis, generate
 * embeddings and persist them.  Many operations are no‑ops when the
 * corresponding library is unavailable.
 */
async function processFile(filePath: string, logger?: any) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const ext = path.extname(filePath).toLowerCase();
    let normalized = content;
    // HTML → Markdown via cheerio
    if ((ext === ".html" || ext === ".htm") && cheerio) {
      const $ = cheerio.load(content);
      normalized = $.text();
    }
    // TODO: Jina‑AI reader, TypeDoc and translator integration
    // Normalize other file types here

    // Run static analysis via semgrep if available
    await runSemgrep(filePath, logger);

    // Generate vector embeddings and store them
    await storeEmbedding(filePath, normalized, logger);
  } catch (err) {
    if (logger) {
      logger.warn(`Failed to process file ${filePath}: ${err}`);
    }
  }
}

/**
 * Run semgrep on a single file and log findings.  This function spawns the
 * semgrep CLI if it is installed in the container.  When semgrep is not
 * available, the function returns without error.
 */
async function runSemgrep(filePath: string, logger?: any): Promise<void> {
  return new Promise((resolve) => {
    const semgrep = spawn("semgrep", ["--quiet", "--json", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    semgrep.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    semgrep.on("close", (code) => {
      if (code === 0 && output) {
        try {
          const result = JSON.parse(output);
          if (result.results && result.results.length > 0 && logger) {
            logger.info(`Semgrep findings for ${filePath}: ${result.results.length}`);
          }
        } catch (err) {
          // ignore parse errors
        }
      } else if (code === 127) {
        // semgrep not installed
        if (logger) {
          logger.info("semgrep not available; skipping static analysis");
        }
      }
      resolve();
    });
  });
}

/**
 * Compute an embedding for a document and store it in the vector database.
 */
async function storeEmbedding(filePath: string, text: string, logger?: any): Promise<void> {
  if (!lancedb || !langchain) {
    return;
  }
  try {
    // Create or open the database in .pala/db
    const dbPath = path.resolve(".pala/db/ingestion-vectors");
    await fs.mkdir(dbPath, { recursive: true });
    const db = await lancedb.connect(dbPath);
    const table = await db.openTable("embeddings");
    // Chunk the text
    const splitter = new langchain.text_splitter.RecursiveCharacterTextSplitter({
      chunkSize: 1024,
      chunkOverlap: 100
    });
    const docs = await splitter.createDocuments([text]);
    for (const doc of docs) {
      const embedding = await computeEmbedding(doc.pageContent);
      await table.add([{ id: filePath, embedding, text: doc.pageContent }]);
    }
    if (logger) {
      logger.info(`Stored ${docs.length} embeddings for ${filePath}`);
    }
  } catch (err) {
    if (logger) {
      logger.warn(`Failed to store embedding for ${filePath}: ${err}`);
    }
  }
}

/**
 * Compute a vector embedding for a piece of text.  This is a stub and should
 * be replaced with a call to a real embedding model (e.g. OpenAI,
 * HuggingFace, TensorFlowJS).  In this implementation it returns an
 * array of zeros to allow end‑to‑end flow without a model.
 */
async function computeEmbedding(text: string): Promise<number[]> {
  // Placeholder: return a fixed-size zero vector
  return new Array(384).fill(0);
}

/**
 * Main entry point.  Clone or read a repository/directory, ingest its
 * contents and optionally watch for changes.
 */
export async function runIngestion(config: IngestionConfig): Promise<void> {
  const logger = winston
    ? winston.createLogger({ level: "info", transports: [new winston.transports.Console()] })
    : console;
  const outDir = config.outDir || path.resolve(".pala/ingest-temp");
  if (config.repoUrl) {
    logger.info(`Cloning ${config.repoUrl} into ${outDir}`);
    await cloneRepo(config.repoUrl, outDir);
  } else if (config.localDir) {
    logger.info(`Ingesting local directory ${config.localDir}`);
  } else {
    throw new Error("Either repoUrl or localDir must be provided");
  }
  const ingestRoot = config.localDir || outDir;
  await ingestDirectory(ingestRoot, async (file) => processFile(file, logger));
  if (config.watch && chokidar) {
    logger.info(`Watching for changes in ${ingestRoot}`);
    const watcher = chokidar.watch(ingestRoot, { ignoreInitial: true });
    watcher.on("all", async (event: string, changedPath: string) => {
      if (event === "add" || event === "change") {
        logger.info(`Detected ${event} on ${changedPath}`);
        await processFile(changedPath, logger);
      }
    });
  }
}

// When executed directly, parse CLI arguments and run ingestion
if (require.main === module) {
  const [, , ...args] = process.argv;
  const config: IngestionConfig = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--repo") {
      config.repoUrl = args[++i];
    } else if (arg === "--dir") {
      config.localDir = args[++i];
    } else if (arg === "--watch") {
      config.watch = true;
    } else if (arg === "--out") {
      config.outDir = args[++i];
    }
  }
  runIngestion(config).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
