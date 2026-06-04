import path from "node:path";
import process from "node:process";

export function createPaths(projectRoot = process.cwd()) {
  const palaDir = path.join(projectRoot, ".pala");
  const evidenceDir = path.join(palaDir, "evidence");
  return {
    projectRoot,
    palaDir,
    stateDir: path.join(palaDir, "state"),
    ledgerDir: path.join(palaDir, "ledger"),
    memoryDir: path.join(palaDir, "memory"),
    evidenceDir,
    rawEvidenceDir: path.join(evidenceDir, "raw"),
    archiveDir: path.join(palaDir, "archive"),
    dbDir: path.join(palaDir, "db"),
    dbPath: path.join(palaDir, "db", "pala.sqlite"),
    schemaPath: path.join(palaDir, "schema", "001_init.sql"),
    docsEvidenceDir: path.join(projectRoot, "docs", "evidence")
  };
}

export const PATHS = createPaths();
export const PROJECT_ROOT = PATHS.projectRoot;

export function toProjectPath(filePath, projectRoot = PROJECT_ROOT) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}
