import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createContext } from "../src/context.js";
import { status } from "../src/status.js";
import { install } from "../src/installer.js";
import { installUpstreamPayload, update } from "../src/update.js";
import { watchTick } from "../src/watch.js";
import { makeFixture, readText } from "./helpers.js";

function fixture(t) {
  const ctx = makeFixture();
  t.after(() => rmSync(ctx.testRoot, { recursive: true, force: true }));
  ctx.run = () => assert.fail("unexpected external command");
  return ctx;
}

function upstreamPackage(ctx, prefix, version = "0.2.0", compat = ctx.payloads.omp.compat) {
  const dir = join(prefix, "node_modules", "omp-di18n");
  mkdirSync(join(prefix, "node_modules"), { recursive: true });
  cpSync(ctx.payloads.omp.dir, dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "omp-di18n", version }));
  writeFileSync(join(dir, "compat.json"), JSON.stringify(compat));
  writeFileSync(join(dir, "omp-di18n.ts"), `export const version = ${JSON.stringify(version)};\n`);
  return dir;
}

const versions = (version) => ({ omp: { npm: { version }, latest: version } });
const npmPrefix = (args) => args[args.indexOf("--prefix") + 1];

test("downloads payloads without npm lifecycle scripts and caches only validated packages", async (t) => {
  const ctx = fixture(t);
  let calls = 0;
  ctx.run = (_binary, args) => {
    calls++;
    assert.ok(args.includes("--ignore-scripts"), "unattended downloads must not execute install hooks before compatibility checks");
    assert.equal(args.at(-1), "omp-di18n@0.2.0");
    upstreamPackage(ctx, npmPrefix(args));
  };

  const payload = await installUpstreamPayload(ctx, "omp", "0.2.0");
  assert.equal(payload.dir, join(ctx.paths.upstreamDir, "omp-0.2.0", "node_modules", "omp-di18n"));
  assert.equal(payload.version, "0.2.0");
  assert.equal((await installUpstreamPayload(ctx, "omp", "0.2.0")).dir, payload.dir);
  assert.equal(calls, 1);
  assert.deepEqual(readdirSync(ctx.paths.upstreamDir), ["omp-0.2.0"]);
});

test("failed npm downloads cannot become reusable partial caches", async (t) => {
  const ctx = fixture(t);
  let calls = 0;
  ctx.run = (_binary, args) => {
    calls++;
    upstreamPackage(ctx, npmPrefix(args));
    if (calls === 1) throw new Error("download interrupted after extraction");
  };

  await assert.rejects(installUpstreamPayload(ctx, "omp", "0.2.0"), /download interrupted/);
  assert.deepEqual(readdirSync(ctx.paths.upstreamDir), []);
  assert.equal((await installUpstreamPayload(ctx, "omp", "0.2.0")).version, "0.2.0");
  assert.equal(calls, 2, "a later explicit attempt must invoke npm, not reuse a failed install");
});

for (const defect of ["wrong name", "wrong version", "missing file"]) {
  test(`rejects an upstream cache with ${defect}`, async (t) => {
    const ctx = fixture(t);
    const dir = upstreamPackage(ctx, join(ctx.paths.upstreamDir, "omp-0.2.0"));
    if (defect === "missing file") rmSync(join(dir, "omp-di18n.zh-CN.json"));
    else writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: defect === "wrong name" ? "other-package" : "omp-di18n",
      version: defect === "wrong version" ? "0.1.0" : "0.2.0",
    }));
    await assert.rejects(installUpstreamPayload(ctx, "omp", "0.2.0"));
  });
}

for (const failure of ["download", "incompatible", "registry"]) {
  test(`online update preserves the installed payload after ${failure} failure`, async (t) => {
    const ctx = fixture(t);
    install(ctx, "omp");
    const target = join(ctx.paths.ompDir, "omp-di18n.ts");
    writeFileSync(target, "existing installation with user edits\n");
    ctx.state.component.omp.installedVersion = "0.1.5";
    const before = { ...ctx.state.component.omp };
    const originalPayload = ctx.payloads.omp;
    if (failure === "download") ctx.run = () => { throw new Error("npm unavailable"); };
    if (failure === "incompatible") {
      upstreamPackage(ctx, join(ctx.paths.upstreamDir, "omp-0.2.0"), "0.2.0", {
        host: { omp: { range: ">=20.0.0 <21.0.0" } },
      });
    }
    const result = await update(ctx, "omp", { upstreamVersions: failure === "registry" ? {} : versions("0.2.0") });
    assert.deepEqual(result.updated, []);
    assert.equal(result.skipped.length, 1);
    assert.equal(readText(target), "existing installation with user edits\n");
    assert.deepEqual(ctx.state.component.omp, before);
    assert.equal(ctx.payloads.omp, originalPayload);
    assert.deepEqual(readdirSync(ctx.paths.ompDir).sort(), ["omp-di18n.ts", "omp-di18n.zh-CN.json"].sort());
  });
}

test("an older registry version cannot downgrade a newer installed payload", async (t) => {
  const ctx = fixture(t);
  install(ctx, "omp");
  ctx.state.component.omp.installedVersion = "0.3.0";
  const target = join(ctx.paths.ompDir, "omp-di18n.ts");
  writeFileSync(target, "newer installed version\n");
  upstreamPackage(ctx, join(ctx.paths.upstreamDir, "omp-0.2.0"));
  const result = await update(ctx, "omp", { upstreamVersions: versions("0.2.0") });
  assert.deepEqual(result.updated, []);
  assert.equal(readText(target), "newer installed version\n");
  assert.equal(ctx.state.component.omp.installedVersion, "0.3.0");
});

test("update checks the selected upstream compatibility instead of rejecting the bundled rules first", async (t) => {
  const ctx = fixture(t);
  ctx.hosts.omp.version = "20.0.0";
  upstreamPackage(ctx, join(ctx.paths.upstreamDir, "omp-0.2.0"), "0.2.0", {
    host: { omp: { range: ">=20.0.0 <21.0.0" } },
  });
  const result = await update(ctx, "omp", { upstreamVersions: versions("0.2.0") });
  assert.equal(result.updated[0]?.version, "0.2.0");
  assert.equal(ctx.state.component.omp.installedVersion, "0.2.0");
});

test("a first install can use a compatible bundled payload after download failure", async (t) => {
  const ctx = fixture(t);
  ctx.run = () => { throw new Error("npm unavailable"); };
  const result = await update(ctx, "omp", { upstreamVersions: versions("0.2.0") });
  assert.equal(result.updated[0]?.version, "0.1.0");
  assert.equal(existsSync(join(ctx.paths.ompDir, "omp-di18n.ts")), true);
});

test("watch updates only the component with a new release", async (t) => {
  const ctx = fixture(t);
  install(ctx, "all");
  const ternTarget = join(ctx.paths.ternTarget, "window.luau");
  writeFileSync(ternTarget, "user Tern changes\n");
  let calls = 0;
  ctx.run = (_binary, args) => {
    calls++;
    assert.ok(args.includes("--ignore-scripts"));
    upstreamPackage(ctx, npmPrefix(args));
  };
  const result = await watchTick(ctx, {
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => String(url).includes("registry.npmjs.org")
        ? { version: String(url).includes("omp-di18n") ? "0.2.0" : "0.1.0" }
        : { tag_name: "0.1.0" },
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.update.updated.map(({ name }) => name), ["omp"]);
  assert.equal(readText(ternTarget), "user Tern changes\n");
  assert.deepEqual(readdirSync(ctx.paths.ternPluginsDir), ["tern-zh-plus"]);
});

function cachedPayload(ctx, name, version, compat) {
  const payload = ctx.payloads[name];
  const dir = join(ctx.paths.upstreamDir, `${name}-${version}`, "node_modules", payload.packageName);
  mkdirSync(join(dir, ".."), { recursive: true });
  cpSync(payload.dir, dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: payload.packageName, version }));
  writeFileSync(join(dir, "compat.json"), JSON.stringify(compat));
  return dir;
}

function rebuild(ctx, bundled) {
  return createContext({ paths: ctx.paths, payloads: { ...bundled }, hosts: ctx.hosts, logger: ctx.logger, run: ctx.run });
}

for (const name of ["tern", "omp"]) {
  test(`${name} installed upstream rules survive context rebuilds and cache removal`, async (t) => {
    const ctx = fixture(t);
    const bundled = { ...ctx.payloads };
    const compat = name === "tern"
      ? { host: { tern: { builds: ["0.9.30 (newbuild)"] } } }
      : { host: { omp: { range: ">=20.0.0 <21.0.0" } } };
    ctx.hosts[name] = { ...ctx.hosts[name], version: name === "tern" ? "0.9.30" : "20.0.0", build: "newbuild" };
    cachedPayload(ctx, name, "0.2.0", compat);
    await update(ctx, name, { upstreamVersions: { [name]: { npm: { version: "0.2.0" } } } });
    rmSync(ctx.paths.upstreamDir, { recursive: true });

    const next = rebuild(ctx, bundled);
    assert.deepEqual(next.compat[name], compat);
    status(next, { json: true });
    assert.equal(next.state.component[name].disabled, false);
    const watched = rebuild(ctx, bundled);
    assert.deepEqual((await watchTick(watched, { autoUpdate: false })).actions, []);
    assert.equal(watched.state.component[name].installedVersion, "0.2.0");
    assert.equal(existsSync(name === "tern" ? ctx.paths.ternTarget : ctx.paths.ompFiles[0]), true);
    assert.throws(() => install(watched, name), /宿主不兼容/, "explicit bundled installation must check bundled rules, not installed rules");
  });
}

test("legacy state resolves matching installed source rules and treats unavailable rules as unknown", async (t) => {
  const ctx = fixture(t);
  const bundled = { ...ctx.payloads };
  const compat = { host: { omp: { range: ">=20.0.0 <21.0.0" } } };
  ctx.hosts.omp.version = "20.0.0";
  const source = cachedPayload(ctx, "omp", "0.2.0", compat);
  await update(ctx, "omp", { upstreamVersions: versions("0.2.0") });
  delete ctx.state.component.omp.installedPayload;
  ctx.state.save();
  assert.deepEqual(rebuild(ctx, bundled).compat.omp, compat);

  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "omp-di18n", version: "0.3.0" }));
  const mismatched = rebuild(ctx, bundled);
  assert.equal(mismatched.compat.omp, null, "source metadata must match the recorded installed version");
  assert.deepEqual((await watchTick(mismatched, { autoUpdate: false })).actions, []);
  rmSync(source, { recursive: true });
  const missing = rebuild(ctx, bundled);
  status(missing, { json: true });
  assert.equal(missing.compat.omp, null);
  assert.equal(existsSync(ctx.paths.ompFiles[0]), true);
});

test("cache and stale installation records alone cannot select installed rules", (t) => {
  const ctx = fixture(t);
  const bundled = { ...ctx.payloads };
  const compat = { host: { omp: { range: ">=20.0.0 <21.0.0" } } };
  const source = cachedPayload(ctx, "omp", "0.2.0", compat);
  ctx.state.component.omp = {
    installed: true, installedVersion: "0.2.0", source,
    installedPayload: { packageName: "omp-di18n", version: "0.2.0", compat },
  };
  ctx.state.save();
  assert.deepEqual(rebuild(ctx, bundled).compat.omp, bundled.omp.compat);
});

test("legacy bundled installations without a compatibility snapshot still use bundled rules", (t) => {
  const ctx = fixture(t);
  const bundled = { ...ctx.payloads };
  install(ctx, "omp");
  delete ctx.state.component.omp.installedPayload;
  ctx.state.save();
  assert.deepEqual(rebuild(ctx, bundled).compat.omp, bundled.omp.compat);
});

test("a failed replacement preserves the previous installed rules through rollback and restart", async (t) => {
  const ctx = fixture(t);
  const bundled = { ...ctx.payloads };
  const compat = { host: { tern: { builds: ["0.9.30 (newbuild)"] } } };
  ctx.hosts.tern = { ...ctx.hosts.tern, version: "0.9.30", build: "newbuild" };
  cachedPayload(ctx, "tern", "0.2.0", compat);
  await update(ctx, "tern", { upstreamVersions: { tern: { npm: { version: "0.2.0" } } } });
  const before = readText(join(ctx.paths.ternTarget, "window.luau"));
  cachedPayload(ctx, "tern", "0.3.0", { host: { tern: { builds: ["0.9.30 (newbuild)", "0.9.31 (future)"] } } });
  ctx.hosts.tern.binary = "fake-tern";
  ctx.run = () => { throw new Error("installer failed"); };
  await assert.rejects(update(ctx, "tern", { upstreamVersions: { tern: { npm: { version: "0.3.0" } } } }), /installer failed/);
  assert.equal(readText(join(ctx.paths.ternTarget, "window.luau")), before);
  assert.deepEqual(ctx.compat.tern, compat);
  const next = rebuild(ctx, bundled);
  assert.equal(next.state.component.tern.installedPayload.version, "0.2.0");
  assert.deepEqual(next.compat.tern, compat);
  assert.deepEqual((await watchTick(next, { autoUpdate: false })).actions, []);
});
