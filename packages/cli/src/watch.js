/** `zh watch`: periodic compatibility enforcement + upstream update check. */
import { detectHosts } from "./host.js";
import { enforceCompatibility, installedVersion } from "./installer.js";
import { isNewer, checkUpstreams } from "./upstream.js";
import { update } from "./update.js";

export function parseInterval(text) {
  if (typeof text === "number" && Number.isFinite(text)) {
    if (text < 1000) throw new Error("interval must be at least 1s");
    return text;
  }
  const match = String(text ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) throw new Error(`invalid interval: ${text} (use e.g. 30s, 30m, 2h)`);
  const value = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  const ms = Math.round(value * factor);
  if (ms < 1000) throw new Error("interval must be at least 1s");
  return ms;
}

export function defaultRefreshHosts(ctx, options = {}) {
  return () =>
    detectHosts({
      ternBin: options.ternBin,
      ompBin: options.ompBin,
      env: ctx.paths.env,
      paths: ctx.paths,
    });
}

/** One watch cycle. Never rejects because of network errors. */
export async function watchTick(ctx, options = {}) {
  if (options.refreshHosts) ctx.hosts = options.refreshHosts();
  const actions = enforceCompatibility(ctx);
  let components = null;
  let updateResult = null;

  if (options.autoUpdate !== false) {
    const result = await checkUpstreams(ctx, {
      fetchImpl: options.fetchImpl ?? ctx.fetchImpl,
      timeout: options.timeout,
    });
    components = result.components;

    const candidates = [];
    for (const [name, entry] of Object.entries(components)) {
      const previous = ctx.state.upstream[name] || {};
      ctx.state.upstream[name] = {
        ...previous,
        ...entry,
        failures: result.failures.filter((failure) => failure.component === name),
      };
      const latest = entry?.npm?.version || entry?.latest;
      if (!latest) continue;
      const current = installedVersion(ctx, name);
      const bundled = ctx.payloads[name]?.version;
      const baseline = current !== "未知" && !current.includes("(") ? current : bundled;
      const attempted = previous.lastAutoUpdateVersion;
      if (isNewer(latest, baseline) && attempted !== latest) {
        candidates.push({ name, latest });
      }
    }

    if (candidates.length) {
      for (const candidate of candidates) {
        ctx.state.upstream[candidate.name].lastAutoUpdateVersion = candidate.latest;
      }
      ctx.logger.info(
        `发现上游新版本：${candidates.map((candidate) => `${candidate.name} ${candidate.latest}`).join(", ")}，开始自动更新`,
      );
      updateResult = await update(ctx, "all", {
        upstreamVersions: components,
        fetchImpl: options.fetchImpl ?? ctx.fetchImpl,
        timeout: options.timeout,
      });
      ctx.state.record({
        action: "auto-update",
        components: updateResult.updated,
        upstream: candidates,
      });
    } else {
      ctx.logger.info("上游检查完成：没有需要自动更新的版本");
    }
  } else {
    ctx.logger.info("已关闭上游自动更新（--no-auto-update），仅检查兼容性");
  }

  ctx.state.save();
  return { actions, components, update: updateResult };
}

/**
 * Runs one tick immediately, then every interval until SIGINT/SIGTERM or until
 * `options.signal` aborts. `once` runs a single tick (used by tests).
 */
export async function runWatch(ctx, options = {}) {
  const intervalMs = parseInterval(options.interval ?? "30m");
  const tickOptions = {
    autoUpdate: options.autoUpdate !== false,
    fetchImpl: options.fetchImpl,
    timeout: options.timeout,
    refreshHosts: options.refreshHosts,
  };

  const tick = async () => {
    try {
      const result = await watchTick(ctx, tickOptions);
      if (options.report) options.report(result);
      return result;
    } catch (error) {
      ctx.logger.error(`watch 周期失败（将继续运行）: ${error.stack || error.message}`);
      return null;
    }
  };

  if (options.once) return tick();

  await tick();
  ctx.logger.info(`watch 已启动，间隔 ${options.interval ?? "30m"}`);
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      void tick();
    }, intervalMs);

    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      options.signal?.removeEventListener?.("abort", stop);
      ctx.logger.info("watch 已停止");
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (options.signal) {
      if (options.signal.aborted) stop();
      else options.signal.addEventListener("abort", stop, { once: true });
    }
  });
}
