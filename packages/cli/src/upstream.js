/** Upstream release / npm version probing. Failures are logged, never thrown. */
import { maxSemver, parseSemver } from "./semver.js";

export const UPSTREAM_SOURCES = {
  tern: {
    npm: "tern-zh-plus",
    github: "losewayy/tern-zh-cn",
  },
  omp: {
    npm: "omp-di18n",
    github: "losewayy/omp-di18n",
  },
};

export const DEFAULT_TIMEOUT_MS = 5000;

export function npmRegistryUrl(name) {
  return `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`;
}

export function releaseTag(data) {
  if (!data || typeof data !== "object") return null;
  return data.tag_name || data.name || null;
}

async function fetchJson(url, { fetchImpl, timeout, logger, label }) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timeout after ${timeout}ms`));
    }, timeout);
    timer.unref?.();
  });
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "tern-omp-zh",
        },
      }),
      deadline,
    ]);
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "no-response"}`);
    return await Promise.race([response.json(), deadline]);
  } catch (error) {
    logger?.warn(`上游检查失败 (${label}): ${error.name === "AbortError" ? "超时" : error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls GitHub releases and the npm registry for both components.
 * Returns { components: {tern, omp}, failures } and never rejects.
 */
export async function checkUpstreams(ctx, { fetchImpl = ctx.fetchImpl, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const components = {};
  const failures = [];

  if (typeof fetchImpl !== "function") {
    ctx.logger.warn("当前 Node 不提供 fetch，跳过上游检查");
    return { components, failures: [{ label: "fetch", error: "unavailable" }] };
  }

  for (const [name, source] of Object.entries(UPSTREAM_SOURCES)) {
    const entry = { checkedAt: new Date().toISOString(), github: null, npm: null, latest: null };
    const [github, npm] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${source.github}/releases/latest`, {
        fetchImpl,
        timeout,
        logger: ctx.logger,
        label: `${source.github} releases`,
      }),
      fetchJson(npmRegistryUrl(source.npm), {
        fetchImpl,
        timeout,
        logger: ctx.logger,
        label: `${source.npm} npm`,
      }),
    ]);

    if (github) {
      const tag = releaseTag(github);
      if (tag) entry.github = { repo: source.github, tag, version: String(tag).replace(/^v/i, "") };
      else failures.push({ component: name, label: `${source.github} releases`, error: "no tag" });
    } else {
      failures.push({ component: name, label: `${source.github} releases`, error: "unavailable" });
    }

    if (npm?.version) entry.npm = { name: source.npm, version: npm.version };
    else failures.push({ component: name, label: `${source.npm} npm`, error: "unavailable" });

    entry.latest = maxSemver([entry.github?.version, entry.npm?.version].filter(Boolean));
    components[name] = entry;
  }

  return { components, failures };
}

export function isNewer(version, current) {
  if (!parseSemver(version)) return false;
  if (!parseSemver(current)) return true;
  return maxSemver([version, current]) === version && version !== current;
}

export function upstreamLatest(entry) {
  return entry?.latest || null;
}
