# V6 Data Ingestion Contract

Pala OS needs a repeatable and auditable way to pull in external code and
documentation, analyse it, store embeddings and summarised state and present
results through the dashboard.  The **V6 Data Ingestion Contract** defines
this pipeline.  It builds on the “Top 50 Fortress Stack” – extracting data,
processing it into memory, exposing it through a UI and enforcing quality and
security guardrails.  This document outlines the responsibilities of each
stage and highlights the key technologies used in V6 with supporting
citation from public documentation.

## Objectives

1. **Autonomy & reproducibility** – Data ingestion should be self‑contained.  A
   developer on Windows 10/11 can run `docker‑compose up` or `npx pala:init`
   and Pala OS will ingest a target repository or directory without global
   dependencies.  All operations run inside a container using Node .js.
2. **Broad language and format support** – The pipeline must handle source
   code, HTML, markdown, API definitions and arbitrary binary assets.  It
   should extract meaningful structure and semantics for later retrieval.
3. **Security & quality** – Incoming code is scanned for vulnerabilities and
   policy violations before it is inserted into memory.  Nothing runs or
   executes without the user’s explicit approval.  Static analysis findings,
   ledger events and evidence logs are recorded for later audit.
4. **Local memory & RAG** – Ingested artifacts are turned into vector
   embeddings stored in a local database for retrieval‑augmented generation
   (RAG).  The memory system uses an embedded, developer‑friendly vector
   database that provides near in‑memory performance when reading from disk
   【706640296219367†L61-L63】.  Ingestion is append‑only; past runs are
   preserved for reproducibility.
5. **Dashboard contract** – Processed data must be consumable by Pala OS’s
   dashboard.  The UI reads only the local database, runtime state and
   evidence files (it never writes).  If ingestion cannot determine status
   it must return `Unknown`, `Not checked` or `Manual verification required`.

## Responsibilities

The ingestion service is responsible for the following actions:

1. **Source acquisition** – Clone or fetch a repository or local directory.
   - GitHub sources are cloned using the
     **Isomorphic‑git** library, a pure JavaScript implementation of Git
     that works in Node and the browser and can read, write, fetch and push
     repositories 【472252619225502†L52-L56】.  For GitHub REST/GraphQL API
     operations (e.g. listing pull requests or fetching commit metadata), the
     extendable **@octokit/core** client is used【943715752858722†L6-L10】.
   - Static archives or other HTTP resources are retrieved with the
     **Axios** HTTP client, which provides a promise‑based API for
     GET/POST requests in Node.js and the browser【433841950436611†L15-L19】.
   - Local directories can be ingested directly without network activity.

2. **Content extraction & parsing** – Once the source tree is available
   locally, files are parsed into normalised forms:
   - **Jina‑AI reader** converts PDFs, HTML and common programming languages
     into Markdown for AI consumption.
   - **Cheerio** is used as a fast, flexible HTML/XML parser that implements a
     subset of jQuery; it normalises DOM traversal and eliminates browser
     inconsistencies 【76690071108044†L14-L16】【76690071108044†L40-L47】.
   - **TypeDoc** reads TypeScript code and produces structured JSON or HTML
     documentation from inline comments【233004064251199†L8-L29】.
   - **Micromatch** provides efficient glob matching to skip
     irrelevant or dangerous files (e.g. `node_modules`, caches).  It is a
     fast alternative to minimatch and multimatch with an active community
     【755781995056940†L41-L45】.
   - **FBKarschnia/chatgpt‑md‑translator** translates foreign language
     documents into the user’s language before embedding.

3. **Static analysis & guardrails** – Before any information is committed to
   memory:
   - **Semgrep**, a fast open‑source static analysis tool, scans code for
     security bugs and injection vulnerabilities and runs entirely locally
     so code is never uploaded to a third‑party service【250044277609369†L451-L454】.
   - Pre‑commit hooks are enforced via **pre‑commit** and **husky**.  The
     pre‑commit framework ensures that lints, tests and static analysis run
     on every commit【702585052982842†L23-L45】, while Husky makes Git hooks
     easy to set up and only runs on changed files【818569438906180†L42-L49】,
     storing hooks in a tracked `.husky/` directory【818569438906180†L68-L75】.
   - **Validator.js** validates and sanitises untrusted string input before
     parsing; it offers more than twenty validators and works in both
     client and server environments【821961812614698†L215-L224】.
   - **Secure JSON parse** prevents prototype pollution when parsing
     untrusted JSON.  If parsing fails, ingestion aborts and logs an error.

4. **Vector memory & storage** – Normalised documents are embedded and
   stored.  Pala OS uses **LanceDB**, a serverless, Apache Arrow–based
   vector database described as a “developer‑friendly embedded vector
   database” that can store multimodal data and deliver near in‑memory
   performance from disk【706640296219367†L61-L63】.  **LangChain.js** is
   used to chunk documents and interact with the embedding model; outputs
   are stored in LanceDB.  **LocalForage** provides a simple,
   asynchronous, localStorage‑like API for caching ingestion state and
   options.  It improves the offline experience by allowing developers to
   store many types of data (arrays, blobs, objects, etc.) with a promise
   API【561779619560964†L44-L51】.

5. **Logging & monitoring** –
   - **Winston** records structured logs for each ingestion run, capturing
     start/end times, exit codes, processed files and analysis findings.
   - **Chokidar** watches the target directory and triggers incremental
     ingestions when files change.  It is a cross‑platform file watching
     library optimised for speed and efficiency.
   - **Dotenv** loads environment variables (such as API keys) from a
     `.env` file without exposing secrets in code.

6. **Dashboard integration** – Processed embeddings, semgrep findings,
   evidence summaries and ledger events are written to the local database,
   JSONL ledgers and state snapshots.  The dashboard reads these
   structures to display “Last successful action”, “Engellenen tehdit”
   and other metrics.  If ingestion discovers a critical update or rule
   mismatch when pinging the central repository, it records a `KRITIK
   GUNCELLEME` notice and waits for the user’s approval.

## File Layout

The ingestion service lives under `src/lib/v6-data-ingestion.ts`.  It
exports high‑level functions to run a one‑off ingestion or to watch a
directory.  New entries in `docs/architecture` describe the contract and
usage.  A new CLI command (`pala ingest`) will be introduced in a
future iteration to invoke the service.

## Usage

1. **Bootstrap** – Run `docker‑compose up` or `npx pala:init` to start the
   container and initialise `.pala` directories.
2. **Ingest a repository** – Execute `node src/lib/v6-data-ingestion.js
   <repo-url>`.  The script clones the repository, parses its contents,
   runs static analysis and stores embeddings.
3. **Ingest a local directory** – Provide a local path instead of a URL to
   ingest source files without cloning.
4. **Incremental mode** – Pass `--watch` to enable chokidar and re‑ingest
   on file changes.

## Limitations & Future Work

This contract specifies the interfaces and responsibilities; the actual
implementation may stub external libraries where they are unavailable in
the runtime.  Integration with the existing CLI, automated tests and
dashboard routes will be added in subsequent phases (Phase 25 and
beyond).  Memory migration, decision engine integration and ledger
enrichment will follow the established patterns in existing `src/lib`
modules.