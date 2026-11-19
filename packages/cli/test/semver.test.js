import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, maxSemver, parseSemver, satisfies } from "../src/semver.js";
import { parseOmpVersion, parseTernVersion } from "../src/host.js";

test("parses versions with prerelease and build metadata", () => {
  assert.deepEqual(parseSemver("v19.0.0"), { major: 19, minor: 0, patch: 0, prerelease: [] });
  assert.deepEqual(parseSemver("19.0.0-rc.2"), { major: 19, minor: 0, patch: 0, prerelease: ["rc", "2"] });
  assert.equal(parseSemver("omp/19.0.0"), null);
});

test("compares semver including prerelease ordering", () => {
  assert.ok(compareSemver("19.0.0", "19.0.1") < 0);
  assert.ok(compareSemver("20.0.0", "19.9.9") > 0);
  assert.ok(compareSemver("19.0.0-rc.1", "19.0.0") < 0);
  assert.ok(compareSemver("19.0.0-rc.2", "19.0.0-rc.10") < 0);
  assert.equal(compareSemver("19.0.0+build", "19.0.0"), 0);
});

test("handles comparator, caret, tilde, wildcard, or and hyphen ranges", () => {
  assert.equal(satisfies("19.0.0", ">=19.0.0 <20.0.0"), true);
  assert.equal(satisfies("20.0.0", ">=19.0.0 <20.0.0"), false);
  assert.equal(satisfies("19.5.3", "^19.2.0"), true);
  assert.equal(satisfies("20.0.0", "^19.2.0"), false);
  assert.equal(satisfies("0.2.9", "^0.2.3"), true);
  assert.equal(satisfies("0.3.0", "^0.2.3"), false);
  assert.equal(satisfies("1.2.9", "~1.2.3"), true);
  assert.equal(satisfies("1.3.0", "~1.2.3"), false);
  assert.equal(satisfies("19.7.1", "19.x"), true);
  assert.equal(satisfies("20.0.0", "19.x"), false);
  assert.equal(satisfies("1.5.0", "1.0.0 - 2.0.0"), true);
  assert.equal(satisfies("2.0.1", "1.0.0 - 2.0.0"), false);
  assert.equal(satisfies("18.0.0", ">=19.0.0 || 18.0.0"), true);
  assert.equal(satisfies("18.0.1", ">=19.0.0 || 18.0.0"), false);
});

test("maxSemver ignores non-semver tags and keeps the highest", () => {
  assert.equal(maxSemver(["v0.2.0", "nightly", "0.1.9"]), "v0.2.0");
  assert.equal(maxSemver([]), null);
});

test("parses Tern and omp --version output", () => {
  assert.deepEqual(parseTernVersion("tern 0.9.28 (3e7c863)"), {
    version: "0.9.28",
    build: "3e7c863",
    raw: "tern 0.9.28 (3e7c863)",
  });
  assert.equal(parseTernVersion("tern 0.9.28").build, null);
  assert.equal(parseTernVersion("garbage"), null);
  assert.equal(parseOmpVersion("omp/19.0.0").version, "19.0.0");
  assert.equal(parseOmpVersion("omp/19.0.0-dev.1").version, "19.0.0-dev.1");
});
