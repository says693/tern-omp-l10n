/** Minimal semver implementation (no dependencies) used for host compatibility. */

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(input) {
  if (input === null || input === undefined) return null;
  const match = String(input).trim().match(VERSION_RE);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifier(a, b) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareSemver(a, b) {
  const left = typeof a === "string" ? parseSemver(a) : a;
  const right = typeof b === "string" ? parseSemver(b) : b;
  if (!left || !right) throw new TypeError(`invalid version: ${!left ? a : b}`);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  const lp = left.prerelease || [];
  const rp = right.prerelease || [];
  if (!lp.length && !rp.length) return 0;
  if (!lp.length) return 1;
  if (!rp.length) return -1;
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    if (lp[i] === undefined) return -1;
    if (rp[i] === undefined) return 1;
    const cmp = compareIdentifier(lp[i], rp[i]);
    if (cmp) return cmp;
  }
  return 0;
}

export function maxSemver(versions) {
  let best = null;
  for (const value of versions) {
    const parsed = typeof value === "string" ? parseSemver(value) : value;
    if (!parsed) continue;
    if (!best || compareSemver(parsed, best.version) > 0) best = { version: parsed, raw: value };
  }
  return best ? best.raw : null;
}

function upperBoundForCaret(version) {
  if (version.major > 0) return { major: version.major + 1, minor: 0, patch: 0 };
  if (version.minor > 0) return { major: 0, minor: version.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: version.patch + 1 };
}

function partialVersion(text) {
  const match = text.trim().match(/^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = match[2] && !/[xX*]/.test(match[2]) ? Number(match[2]) : null;
  const patch = match[3] && !/[xX*]/.test(match[3]) ? Number(match[3]) : null;
  return { major, minor, patch, wildcard: minor === null || patch === null };
}

function comparatorSet(text) {
  return text
    .trim()
    .replace(/\s+-\s+/g, " - ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Expands one token into 0..n concrete comparator functions. */
function expandToken(token) {
  if (token === "*" || token === "x" || token === "X") return [() => true];
  const hyphen = token.match(/^([^-]+)\s*-\s*([^-]+)$/);
  if (hyphen) {
    const low = partialVersion(hyphen[1]);
    const high = partialVersion(hyphen[2]);
    if (!low || !high) return null;
    return [
      (v) => compareSemver(v, low) >= 0,
      (v) => compareSemver(v, { major: high.major, minor: high.minor ?? 0, patch: high.patch ?? 0 }) <= 0,
    ];
  }

  const match = token.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/);
  if (!match) return null;
  const op = match[1] || "=";
  const raw = match[2];
  const parsed = partialVersion(raw);
  if (!parsed) return null;
  const exact = parseSemver(raw);
  const low = { major: parsed.major, minor: parsed.minor ?? 0, patch: parsed.patch ?? 0 };

  if (op === "=" && parsed.wildcard) {
    const next = parsed.minor === null
      ? { major: parsed.major + 1, minor: 0, patch: 0 }
      : { major: parsed.major, minor: parsed.minor + 1, patch: 0 };
    return [(v) => compareSemver(v, low) >= 0 && compareSemver(v, next) < 0];
  }

  switch (op) {
    case ">=":
      return [(v) => compareSemver(v, exact ?? low) >= 0];
    case ">":
      return [(v) => compareSemver(v, exact ?? low) > 0];
    case "<=":
      return [(v) => compareSemver(v, exact ?? low) <= 0];
    case "<":
      return [(v) => compareSemver(v, exact ?? low) < 0];
    case "^": {
      if (!exact) return null;
      const upper = upperBoundForCaret(exact);
      return [(v) => compareSemver(v, exact) >= 0 && compareSemver(v, upper) < 0];
    }
    case "~": {
      if (!exact) return null;
      const upper = { major: exact.major, minor: exact.minor + 1, patch: 0 };
      return [(v) => compareSemver(v, exact) >= 0 && compareSemver(v, upper) < 0];
    }
    default:
      return [(v) => compareSemver(v, exact ?? low) === 0];
  }
}

export function satisfies(version, range) {
  const parsed = typeof version === "string" ? parseSemver(version) : version;
  if (!parsed || typeof range !== "string" || !range.trim()) return false;
  for (const alternative of range.split("||")) {
    const tokens = comparatorSet(alternative);
    if (!tokens.length) continue;
    let supported = true;
    const checks = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (next === "-") {
        const expanded = expandToken(`${token} - ${tokens[i + 2]}`);
        if (!expanded) {
          supported = false;
          break;
        }
        checks.push(...expanded);
        i += 2;
        continue;
      }
      const expanded = expandToken(token);
      if (!expanded) {
        supported = false;
        break;
      }
      checks.push(...expanded);
    }
    if (supported && checks.every((check) => check(parsed))) return true;
  }
  return false;
}
