import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "l10n.js");

test("CLI dry-run install leaves the filesystem untouched", () => {
  const root = mkdtempSync(join(tmpdir(), "l10n-cli-"));
  const home = join(root, "home");
  const env = {
    ...process.env,
    L10N_HOME: home,
    L10N_APPDATA: join(root, "roaming"),
    L10N_STATE_DIR: join(root, "state"),
  };
  const result = spawnSync(process.execPath, [BIN, "install", "all", "--dry-run"], {
    encoding: "utf8",
    env,
    timeout: 30000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[dry-run\]/);
  assert.equal(existsSync(join(home, ".omp")), false);
  assert.equal(existsSync(join(root, "roaming")), false);
  assert.equal(existsSync(join(root, "state")), false);
});

test("CLI rejects unknown commands with exit code 1", () => {
  const result = spawnSync(process.execPath, [BIN, "nonsense"], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知命令/);
});
