import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { install, isInstalled, uninstall } from "../src/installer.js";
import { makeFixture, readText } from "./helpers.js";

test("installs both payloads into temp dirs without a Tern binary", () => {
  const ctx = makeFixture();
  const installed = install(ctx, "all");
  assert.deepEqual(installed, ["tern", "omp"]);

  assert.equal(readText(join(ctx.paths.ternTarget, "plugin.toml")), 'id = "tern-zh-plus"\nversion = "0.9.0"\n');
  assert.equal(readText(join(ctx.paths.ompDir, "omp-di18n.ts")), "export const marker = 'omp-ts';\n");
  assert.equal(readText(join(ctx.paths.ompDir, "omp-di18n.zh-CN.json")), '{"hello":"你好"}\n');
  assert.equal(isInstalled(ctx, "tern"), true);
  assert.equal(isInstalled(ctx, "omp"), true);

  const state = JSON.parse(readText(ctx.paths.stateFile));
  assert.equal(state.components.tern.installedVersion, "0.1.0");
  assert.equal(state.components.omp.installedVersion, "0.1.0");
  assert.equal(state.components.omp.disabled, false);
});

test("backs up existing files and directories before reinstalling", () => {
  const ctx = makeFixture();
  install(ctx, "all");

  writeFileSync(join(ctx.paths.ternTarget, "window.luau"), "user edit\n", "utf8");
  writeFileSync(join(ctx.paths.ompDir, "omp-di18n.ts"), "user omp edit\n", "utf8");
  install(ctx, "all");

  const ternBackups = readdirSync(ctx.paths.ternPluginsDir).filter((entry) => entry.startsWith("tern-zh-plus.backup-"));
  assert.equal(ternBackups.length, 1);
  assert.equal(readText(join(ctx.paths.ternPluginsDir, ternBackups[0], "window.luau")), "user edit\n");

  const ompBackups = readdirSync(ctx.paths.ompDir).filter((entry) => /^omp-di18n\..*\.backup-/.test(entry));
  assert.equal(ompBackups.length, 2);
  const tsBackup = ompBackups.find((entry) => entry.startsWith("omp-di18n.ts.backup-"));
  assert.equal(readText(join(ctx.paths.ompDir, tsBackup)), "user omp edit\n");

  assert.equal(readText(join(ctx.paths.ternTarget, "window.luau")), "return {}\n");
  assert.equal(readText(join(ctx.paths.ompDir, "omp-di18n.ts")), "export const marker = 'omp-ts';\n");
});

test("rolls back the previous install when the Tern installer fails", () => {
  const ctx = makeFixture();
  install(ctx, "tern");
  writeFileSync(join(ctx.paths.ternTarget, "window.luau"), "keep me\n", "utf8");

  ctx.hosts.tern = { ...ctx.hosts.tern, binary: "C:\\fake\\tern.exe" };
  ctx.run = () => {
    throw Object.assign(new Error("simulated tern failure"), { code: "ENOENT" });
  };

  assert.throws(() => install(ctx, "tern", { force: true }), /Tern 安装失败/);
  assert.equal(readText(join(ctx.paths.ternTarget, "window.luau")), "keep me\n");
  assert.equal(existsSync(join(ctx.paths.ternTarget, "plugin.toml")), true);
});

test("dry-run install changes nothing on disk", () => {
  const ctx = makeFixture();
  install(ctx, "all");
  writeFileSync(join(ctx.paths.ompDir, "omp-di18n.ts"), "modified\n", "utf8");
  const backupsBefore = readdirSync(ctx.paths.ompDir).filter((entry) => entry.includes(".backup-"));

  ctx.dryRun = true;
  ctx.state.dryRun = true;
  install(ctx, "all");

  assert.equal(readText(join(ctx.paths.ompDir, "omp-di18n.ts")), "modified\n");
  assert.deepEqual(readdirSync(ctx.paths.ompDir).filter((entry) => entry.includes(".backup-")), backupsBefore);
});

test("uninstall moves payloads to backups instead of deleting them", () => {
  const ctx = makeFixture();
  install(ctx, "all");
  const changed = uninstall(ctx, "all");
  assert.deepEqual(changed, ["tern", "omp"]);

  assert.equal(existsSync(ctx.paths.ternTarget), false);
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts")), false);
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.zh-CN.json")), false);

  const ternBackups = readdirSync(ctx.paths.ternPluginsDir).filter((entry) => entry.startsWith("tern-zh-plus.backup-"));
  assert.equal(ternBackups.length, 1);
  assert.equal(readText(join(ctx.paths.ternPluginsDir, ternBackups[0], "plugin.toml")).includes("tern-zh-plus"), true);

  const state = JSON.parse(readText(ctx.paths.stateFile));
  assert.equal(state.components.tern.installed, false);
  assert.equal(state.components.omp.installed, false);
  assert.equal(state.components.omp.disabled, false);
});

test("install refuses an incompatible host unless --force is used", () => {
  const ctx = makeFixture();
  ctx.hosts.omp = { ...ctx.hosts.omp, version: "20.0.0" };
  assert.throws(() => install(ctx, "omp"), /不兼容/);
  assert.equal(isInstalled(ctx, "omp"), false);
  install(ctx, "omp", { force: true });
  assert.equal(isInstalled(ctx, "omp"), true);
});
