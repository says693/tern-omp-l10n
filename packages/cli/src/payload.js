/** Resolve the payload packages bundled with this CLI. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export class PayloadError extends Error {}

function packageDir(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch (error) {
    throw new PayloadError(`payload package ${name} is not installed next to the CLI (${error.code || error.message})`);
  }
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadPackageInfo(dir) {
  const pkg = readJson(join(dir, "package.json"));
  const compat = readJson(join(dir, "compat.json"));
  return { dir, packageName: pkg.name, version: pkg.version, compat };
}

/**
 * Returns { omp: {dir, files, ...}, tern: {dir, pluginDir, ...} }.
 * Directories can be overridden (tests, local checkouts, upstream npm installs).
 */
export function resolvePayloads(overrides = {}) {
  const ompDir = overrides.ompPayloadDir ?? packageDir("omp-di18n");
  const ternDir = overrides.ternPayloadDir ?? packageDir("tern-zh-plus");
  const omp = loadPackageInfo(ompDir);
  const tern = loadPackageInfo(ternDir);
  return {
    omp: {
      ...omp,
      files: ["omp-di18n.ts", "omp-di18n.zh-CN.json"].map((name) => ({
        source: join(ompDir, name),
        name,
      })),
    },
    tern: {
      ...tern,
      pluginDir: join(ternDir, "plugin"),
    },
  };
}


/** Build one component's payload descriptor from an arbitrary package dir. */
export function createComponentPayload(name, dir) {
  const info = loadPackageInfo(dir);
  if (name === "tern") {
    return { ...info, pluginDir: join(dir, "plugin") };
  }
  return {
    ...info,
    files: ["omp-di18n.ts", "omp-di18n.zh-CN.json"].map((file) => ({
      source: join(dir, file),
      name: file,
    })),
  };
}