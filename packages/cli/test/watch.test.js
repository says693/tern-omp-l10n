import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { install } from "../src/installer.js";
import { parseInterval, runWatch, watchTick } from "../src/watch.js";
import { makeFixture, readText } from "./helpers.js";

test("offline watch tick still completes and records the failure", async () => {
  const ctx = makeFixture();
  install(ctx, "all");
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error("network unreachable");
  };

  const result = await watchTick(ctx, { autoUpdate: true, fetchImpl });
  assert.equal(calls, 4, "two GitHub + two npm probes");
  assert.equal(result.components.tern.latest, null);
  assert.equal(result.components.omp.latest, null);
  assert.equal(result.actions.length, 0);

  assert.equal(existsSync(ctx.paths.stateFile), true);
  const state = JSON.parse(readText(ctx.paths.stateFile));
  assert.equal(state.upstream.omp.failures.length, 2);
  assert.ok(ctx.logLines.some((line) => line.includes("上游检查失败")));
});


test("watch --dry-run reports the mismatch without renaming files", async () => {
  const ctx = makeFixture();
  install(ctx, "omp");
  ctx.hosts.omp = { ...ctx.hosts.omp, version: "20.0.0" };
  ctx.dryRun = true;
  ctx.state.dryRun = true;

  await watchTick(ctx, { autoUpdate: false });
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts")), true);
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts.disabled")), false);
  assert.ok(ctx.logLines.some((line) => line.includes("version mismatch: host=20.0.0")));
  assert.ok(ctx.logLines.some((line) => line.includes("[dry-run] omp 汉化失效")));
});
test("--no-auto-update skips all network probes", async () => {
  const ctx = makeFixture();
  let calls = 0;
  const result = await watchTick(ctx, {
    autoUpdate: false,
    fetchImpl: async () => {
      calls++;
      throw new Error("must not be called");
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.components, null);
});

test("watch tick auto-disables before probing upstream", async () => {
  const ctx = makeFixture();
  install(ctx, "omp");
  ctx.hosts.omp = { ...ctx.hosts.omp, version: "20.0.0" };
  const result = await watchTick(ctx, { autoUpdate: false });
  assert.equal(result.actions.length, 1);
  assert.equal(existsSync(ctx.paths.ompDir + "/omp-di18n.ts"), false);
});

test("runWatch --once performs a single offline-safe tick", async () => {
  const ctx = makeFixture();
  const result = await runWatch(ctx, {
    once: true,
    autoUpdate: true,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.ok(result);
  assert.equal(result.components.omp.latest, null);
});

test("parseInterval accepts minute/hour/short forms and rejects nonsense", () => {
  assert.equal(parseInterval("30m"), 30 * 60_000);
  assert.equal(parseInterval("2h"), 2 * 3_600_000);
  assert.equal(parseInterval("45s"), 45_000);
  assert.equal(parseInterval(5000), 5000);
  assert.throws(() => parseInterval("soon"), /invalid interval/);
  assert.throws(() => parseInterval("10ms"), /at least 1s/);
});
