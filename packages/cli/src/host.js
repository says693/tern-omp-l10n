/** Version parsing and host detection for Tern and omp. */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, join, delimiter } from "node:path";

export function parseTernVersion(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/(?:^|\s|tern\s+)v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:\(([0-9A-Za-z]+)\))?/i);
  if (!match) return null;
  return { version: match[1], build: match[2] || null, raw: text };
}

export function parseOmpVersion(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!match) return null;
  return { version: match[1], build: null, raw: text };
}

function isExecutable(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function onPath(names, env = process.env) {
  const pathValue = env.PATH || env.Path || "";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidates = extname(name) ? [name] : extensions.map((ext) => name + ext);
      for (const candidate of candidates) {
        const full = join(dir, candidate);
        if (isExecutable(full)) return full;
      }
    }
  }
  return null;
}

export function ternCandidates({ explicit, env = process.env, paths } = {}) {
  const localAppData = paths?.localAppData || env.LOCALAPPDATA || "";
  if (explicit) return [explicit];
  const list = [];
  if (env.TERN_BIN) list.push(env.TERN_BIN);
  const fromPath = onPath(["tern"], env);
  if (fromPath) list.push(fromPath);
  if (process.platform === "win32") {
    list.push("H:\\Tern\\tern.com", "H:\\Tern\\tern.exe");
    if (localAppData) list.push(join(localAppData, "Tern", "tern.exe"), join(localAppData, "Tern", "tern.com"));
  }
  list.push("tern");
  return [...new Set(list.filter(Boolean))];
}

export function ompCandidates({ explicit, env = process.env, paths } = {}) {
  const localAppData = paths?.localAppData || env.LOCALAPPDATA || "";
  if (explicit) return [explicit];
  const list = [];
  if (env.OMP_BIN) list.push(env.OMP_BIN);
  const fromPath = onPath(["omp"], env);
  if (fromPath) list.push(fromPath);
  if (localAppData) list.push(join(localAppData, "Tern", "omp", "bin", "omp.exe"));
  list.push("omp");
  return [...new Set(list.filter(Boolean))];
}

export function probeVersion(bin, args, timeout = 5000) {
  const output = execFileSync(bin, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return String(output || "").trim();
}

function findHost(candidates, parse, args = ["--version"]) {
  const failures = [];
  for (const candidate of candidates) {
    // Absolute/relative file paths must exist; bare names are resolved by PATH.
    if ((isAbsolute(candidate) || candidate.includes("\\") || candidate.includes("/")) && !existsSync(candidate)) continue;
    try {
      const raw = probeVersion(candidate, args);
      const parsed = parse(raw);
      if (parsed) return { ...parsed, binary: candidate, error: null };
      failures.push(`${candidate}: unparseable output ${JSON.stringify(raw)}`);
    } catch (error) {
      failures.push(`${candidate}: ${error.code || error.message}`);
    }
  }
  return { version: null, build: null, raw: null, binary: null, error: failures.at(-1) || "not found" };
}

export function detectTern({ explicit, env, paths } = {}) {
  return findHost(ternCandidates({ explicit, env, paths }), parseTernVersion);
}

export function detectOmp({ explicit, env, paths } = {}) {
  return findHost(ompCandidates({ explicit, env, paths }), parseOmpVersion);
}

export function detectHosts({ ternBin, ompBin, env, paths } = {}) {
  return {
    tern: detectTern({ explicit: ternBin, env, paths }),
    omp: detectOmp({ explicit: ompBin, env, paths }),
  };
}

/** Returns a fake host record for tests / offline overrides. */
export function hostRecord(name, raw) {
  const parsed = name === "tern" ? parseTernVersion(raw) : parseOmpVersion(raw);
  if (!parsed) throw new Error(`cannot parse ${name} version: ${raw}`);
  return { ...parsed, binary: null, error: null };
}

export function runHostCommand(binary, args, { timeout = 30000 } = {}) {
  const output = execFileSync(binary, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return String(output || "").trim();
}
