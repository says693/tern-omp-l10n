/** Test fixtures: throwaway installation roots and payload packages. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext } from "../src/context.js";
import { hostRecord } from "../src/host.js";
import { createLogger } from "../src/logger.js";
import { resolvePaths } from "../src/paths.js";
import { resolvePayloads } from "../src/payload.js";

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makePayload(root, name, version, compat, files) {
  const dir = join(root, "fixtures", name);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "package.json"), { name, version });
  writeJson(join(dir, "compat.json"), compat);
  for (const [relative, content] of Object.entries(files)) {
    const file = join(dir, relative);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
  return dir;
}

export function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "tern-omp-zh-test-"));
  const home = join(root, "home");
  const appData = join(root, "roaming");
  const stateDir = join(root, "state");
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });

  const ompPayloadDir = makePayload(
    root,
    "omp-di18n",
    "0.1.0",
    { schema: 1, host: { omp: { range: ">=19.0.0 <20.0.0" } } },
    {
      "omp-di18n.ts": "export const marker = 'omp-ts';\n",
      "omp-di18n.zh-CN.json": '{"hello":"你好"}\n',
    },
  );
  const ternPayloadDir = makePayload(
    root,
    "tern-zh-plus",
    "0.1.0",
    {
      schema: 1,
      host: {
        tern: {
          builds: ["0.9.28 (3e7c863)"],
          versions: ["0.9.28"],
        },
      },
    },
    {
      "plugin/plugin.toml": 'id = "tern-zh-plus"\nversion = "0.9.0"\n',
      "plugin/window.luau": "return {}\n",
      "plugin/compat/0.9.28/prefs.css": ".x{content:'中文'}\n",
    },
  );

  const paths = resolvePaths({ env: { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT }, home, appData, stateDir });
  const payloads = resolvePayloads({ ompPayloadDir, ternPayloadDir });
  const lines = [];
  const logger = createLogger({ file: paths.logFile, quiet: true, sink: (line) => lines.push(line) });

  const ctx = createContext({
    paths,
    payloads,
    logger,
    hosts: {
      tern: hostRecord("tern", "tern 0.9.28 (3e7c863)"),
      omp: hostRecord("omp", "omp/19.0.0"),
    },
  });
  ctx.testRoot = root;
  ctx.logLines = lines;

  return ctx;
}


export function readText(path) {
  return readFileSync(path, "utf8");
}
