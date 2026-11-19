import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOmp, evaluateTern, formatTernBuild } from "../src/compat.js";
import { hostRecord } from "../src/host.js";

const ternCompat = {
  host: {
    tern: {
      builds: ["0.9.28 (3e7c863)", "0.9.23 (35c63ab)", "0.9.12 (e498b49)", "0.9.9 (9c1c09f)"],
      versions: ["0.9.28", "0.9.23", "0.9.12", "0.9.9"],
    },
  },
};
const ompCompat = { host: { omp: { range: ">=19.0.0 <20.0.0" } } };

test("known Tern build is compatible", () => {
  const result = evaluateTern(hostRecord("tern", "tern 0.9.28 (3e7c863)"), ternCompat);
  assert.equal(result.compatible, true);
  assert.equal(result.label, "0.9.28 (3e7c863)");
});

test("same Tern version with an unknown build is incompatible", () => {
  const result = evaluateTern(hostRecord("tern", "tern 0.9.28 (deadbee)"), ternCompat);
  assert.equal(result.compatible, false);
  assert.match(result.reason, /不在白名单/);
});

test("Tern without a build number falls back to the version whitelist", () => {
  const host = hostRecord("tern", "tern 0.9.12");
  assert.equal(formatTernBuild(host), "0.9.12");
  assert.equal(evaluateTern(host, ternCompat).compatible, true);
  assert.equal(evaluateTern(hostRecord("tern", "tern 0.9.30"), ternCompat).compatible, false);
});

test("unknown Tern host does not produce a false incompatibility", () => {
  const result = evaluateTern({ version: null, build: null, error: "not found" }, ternCompat);
  assert.equal(result.compatible, null);
});

test("omp compatibility follows the semver range", () => {
  assert.equal(evaluateOmp(hostRecord("omp", "omp/19.0.0"), ompCompat).compatible, true);
  assert.equal(evaluateOmp(hostRecord("omp", "omp/19.12.3"), ompCompat).compatible, true);
  assert.equal(evaluateOmp(hostRecord("omp", "omp/20.0.0"), ompCompat).compatible, false);
  assert.equal(evaluateOmp(hostRecord("omp", "omp/18.9.9"), ompCompat).compatible, false);
  assert.equal(evaluateOmp({ version: null, error: "not found" }, ompCompat).compatible, null);
});
