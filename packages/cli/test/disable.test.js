import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { describeComponent } from "../src/status.js";
import { enforceCompatibility, install } from "../src/installer.js";
import { makeFixture, readText } from "./helpers.js";

test("auto-disables omp by renaming files when the host leaves the range", () => {
  const ctx = makeFixture();
  install(ctx, "omp");
  ctx.hosts.omp = { ...ctx.hosts.omp, version: "20.0.0" };

  const actions = enforceCompatibility(ctx);
  assert.ok(
    ctx.logLines.some(
      (line) =>
        line.includes("version mismatch: host=20.0.0") && line.includes("supported=>=19.0.0 <20.0.0"),
    ),
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].component, "omp");
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts")), false);
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts.disabled")), true);
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.zh-CN.json.disabled")), true);

  const state = JSON.parse(readText(ctx.paths.stateFile));
  assert.equal(state.components.omp.disabled, true);
  assert.match(state.components.omp.disabledReason, /20\.0\.0/);

  const row = describeComponent(ctx, "omp");
  assert.equal(row.status, "失效（已停用）");
  assert.equal(row.backups, 0);
});

test("auto-disables Tern by moving the plugin dir to a backup when no CLI is usable", () => {
  const ctx = makeFixture();
  install(ctx, "tern");
  ctx.hosts.tern = { ...ctx.hosts.tern, version: "0.9.30", build: "deadbee", binary: null };

  const actions = enforceCompatibility(ctx);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].component, "tern");
  assert.equal(existsSync(ctx.paths.ternTarget), false);

  const backups = readdirSync(ctx.paths.ternPluginsDir).filter((entry) => entry.startsWith("tern-zh-plus.backup-"));
  assert.equal(backups.length, 1);
  assert.equal(readText(join(ctx.paths.ternPluginsDir, backups[0], "plugin.toml")).includes("tern-zh-plus"), true);

  const state = JSON.parse(readText(ctx.paths.stateFile));
  assert.equal(state.components.tern.disabled, true);
  assert.match(state.components.tern.disableMethod, /移动到备份/);

  const row = describeComponent(ctx, "tern");
  assert.equal(row.status, "失效（已停用）");
  assert.equal(row.backups, 1);
});

test("falls back to moving the plugin when tern plugin remove fails", () => {
  const ctx = makeFixture();
  install(ctx, "tern");
  ctx.hosts.tern = {
    ...ctx.hosts.tern,
    version: "0.9.30",
    build: "deadbee",
    binary: "C:\\fake\\tern.exe",
  };
  ctx.run = () => {
    throw new Error("daemon unavailable");
  };

  enforceCompatibility(ctx);
  assert.equal(existsSync(ctx.paths.ternTarget), false);
  assert.equal(
    readdirSync(ctx.paths.ternPluginsDir).some((entry) => entry.startsWith("tern-zh-plus.backup-")),
    true,
  );
  assert.ok(ctx.logLines.some((line) => line.includes("tern plugin remove 失败")));
});

test("compatible hosts cause no disable actions and leave no state churn", () => {
  const ctx = makeFixture();
  install(ctx, "all");
  const before = readText(ctx.paths.stateFile);
  const actions = enforceCompatibility(ctx);
  assert.deepEqual(actions, []);
  assert.equal(readText(ctx.paths.stateFile), before);
});
