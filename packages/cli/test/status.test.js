import assert from "node:assert/strict";
import test from "node:test";
import { install } from "../src/installer.js";
import { status } from "../src/status.js";
import { makeFixture } from "./helpers.js";

test("status prints table plus one line per version/compatibility field", () => {
  const ctx = makeFixture();
  install(ctx, "all");
  const result = status(ctx);

  assert.match(result.text, /\| 组件/);
  assert.match(result.text, /Tern 插件版本: 0\.1\.0|Tern 插件版本: 0\.9\.0/);
  assert.match(result.text, /Tern 宿主版本: 0\.9\.28 \(3e7c863\)/);
  assert.match(result.text, /Tern 兼容性: 兼容/);
  assert.match(result.text, /omp 扩展版本: 0\.1\.0/);
  assert.match(result.text, /omp 宿主版本: 19\.0\.0/);
  assert.match(result.text, /omp 兼容性: 兼容/);
});

test("status --json exposes host and component fields separately", () => {
  const ctx = makeFixture();
  install(ctx, "all");
  const result = status(ctx, { json: true });

  assert.equal(result.host.tern.version, "0.9.28");
  assert.equal(result.host.omp.version, "19.0.0");
  assert.equal(result.components.tern.installed, true);
  assert.equal(result.components.omp.version, "0.1.0");
  assert.deepEqual(result.autoDisabled, []);
});
