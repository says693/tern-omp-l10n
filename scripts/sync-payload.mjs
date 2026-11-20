#!/usr/bin/env node
/**
 * Sync the two localization payloads from their live install locations into
 * the publishable packages. Read-only with respect to the sources.
 *
 *   node scripts/sync-payload.mjs           copy payload into packages/
 *   node scripts/sync-payload.mjs --check   verify packages/ matches sources
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".cache",
  ".tern",
  "plugin-backups",
  "shortcut-backups",
]);
const EXCLUDED_FILE_RE = /(?:\.(?:exe|pdb|log|lnk|bak|tmp|backup|v01-backup)$)|^(?:thumbs\.db|\.ds_store)$|^omp-di18n-(?:debug|misses)\.txt$/i;

function excluded(relPath) {
  const parts = relPath.split(/[\\/]+/);
  if (parts.some((part) => EXCLUDED_DIRS.has(part.toLowerCase()))) return true;
  return EXCLUDED_FILE_RE.test(parts.at(-1));
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(base, full);
    if (excluded(rel)) continue;
    if (entry.isDirectory()) files.push(...walk(full, base));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const env = process.env;
const home = env.TERN_OMP_ZH_SYNC_HOME || homedir();
const appData = env.APPDATA || join(home, "AppData", "Roaming");
const localAppData = env.LOCALAPPDATA || join(home, "AppData", "Local");
const SOURCES = {
  omp: {
    dir: env.TERN_OMP_ZH_SYNC_OMP_DIR || join(home, ".omp", "agent", "extensions"),
    files: ["omp-di18n.ts", "omp-di18n.zh-CN.json"],
    target: join(ROOT, "packages", "omp-di18n"),
  },
  tern: {
    dir:
      env.TERN_OMP_ZH_SYNC_TERN_DIR ||
      [join(appData, "Tern", "plugins", "tern-zh-plus"), join(localAppData, "Tern", "plugins", "tern-zh-plus")].find(
        (candidate) => existsSync(candidate),
      ) ||
      join(appData, "Tern", "plugins", "tern-zh-plus"),
    target: join(ROOT, "packages", "tern-zh-plus"),
  },
};

function collect() {
  const plan = [];

  for (const name of SOURCES.omp.files) {
    const src = join(SOURCES.omp.dir, name);
    if (!existsSync(src)) throw new Error(`missing omp payload file: ${src}`);
    plan.push({ src, dest: join(SOURCES.omp.target, name) });
  }

  if (!existsSync(SOURCES.tern.dir)) throw new Error(`missing Tern plugin directory: ${SOURCES.tern.dir}`);
  for (const src of walk(SOURCES.tern.dir)) {
    const rel = relative(SOURCES.tern.dir, src);
    plan.push({ src, dest: join(SOURCES.tern.target, "plugin", rel) });
  }

  return plan;
}

function summarize(plan) {
  let bytes = 0;
  for (const { src } of plan) bytes += statSync(src).size;
  return `${plan.length} files, ${bytes} bytes`;
}

function verify(plan) {
  const mismatches = [];
  for (const { src, dest } of plan) {
    if (!existsSync(dest)) {
      mismatches.push(`missing  ${relative(ROOT, dest)}`);
      continue;
    }
    const a = statSync(src);
    const b = statSync(dest);
    if (a.size !== b.size || !readFileSync(src).equals(readFileSync(dest))) {
      mismatches.push(`changed  ${relative(ROOT, dest)}`);
    }
  }
  const expected = new Set(plan.map(({ dest }) => resolve(dest)));
  for (const pkg of ["omp-di18n", "tern-zh-plus"]) {
    const base = join(ROOT, "packages", pkg);
    const dir = pkg === "tern-zh-plus" ? join(base, "plugin") : base;
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const abs = resolve(file);
      const isMeta = pkg === "omp-di18n" && ["package.json", "compat.json", "README.md"].includes(relative(base, file));
      if (!isMeta && !expected.has(abs)) mismatches.push(`extra    ${relative(ROOT, file)}`);
    }
  }
  return mismatches;
}

try {
  const plan = collect();

  if (CHECK) {
    const mismatches = verify(plan);
    if (mismatches.length) {
      console.error(`payload differs from live install (${mismatches.length} issue(s)):`);
      for (const line of mismatches) console.error(`  ${line}`);
      process.exitCode = 1;
    } else {
      console.log(`payload matches live install (${summarize(plan)})`);
    }
  } else {
    const ternTarget = join(SOURCES.tern.target, "plugin");
    const guard = resolve(ternTarget) + sep;
    if (!guard.startsWith(resolve(ROOT) + sep)) throw new Error(`refusing to clear unexpected path: ${ternTarget}`);
    rmSync(ternTarget, { recursive: true, force: true });

    for (const { src, dest } of plan) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest);
    }
    console.log(`synced ${platform()} payload: ${summarize(plan)}`);
    console.log(`  omp  <- ${SOURCES.omp.dir}`);
    console.log(`  tern <- ${SOURCES.tern.dir}`);
  }
} catch (error) {
  console.error(`sync failed: ${error.message}`);
  process.exitCode = 1;
}
