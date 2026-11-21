/** `zh update`: refresh installed payloads, optionally from npm. */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { evaluate } from "./compat.js";
import { install, installedVersion, isInstalled, selectComponents } from "./installer.js";
import { createComponentPayload } from "./payload.js";
import { parseSemver } from "./semver.js";
import { checkUpstreams, isNewer } from "./upstream.js";

const PACKAGE_NAMES = {
  tern: "tern-zh-plus",
  omp: "omp-di18n",
};

export function npmRunner(env = process.env) {
  if (env.npm_execpath && existsSync(env.npm_execpath) && env.npm_execpath.endsWith(".js")) {
    return { binary: process.execPath, prefix: [env.npm_execpath] };
  }
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(cli)) return { binary: process.execPath, prefix: [cli] };
  return { binary: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] };
}

export async function installUpstreamPayload(ctx, name, version) {
  if (!parseSemver(version)) throw new Error(`invalid upstream version: ${version}`);
  const packageName = PACKAGE_NAMES[name];
  const prefix = join(ctx.paths.upstreamDir, `${name}-${version}`);
  const packageDir = join(prefix, "node_modules", ...packageName.split("/"));
  const readPayload = (dir) => {
    const payload = createComponentPayload(name, dir);
    if (payload.packageName !== packageName || payload.version !== version) {
      throw new Error(`upstream package mismatch: expected ${packageName}@${version}`);
    }
    const sources = name === "tern" ? [join(payload.pluginDir, "plugin.toml")] : payload.files.map((file) => file.source);
    for (const source of sources) {
      if (!statSync(source).isFile()) throw new Error(`upstream payload missing: ${source}`);
    }
    return payload;
  };

  if (existsSync(join(packageDir, "package.json"))) {
    ctx.logger.info(`复用已下载的 ${packageName}@${version}`);
    return readPayload(packageDir);
  }

  if (ctx.dryRun) {
    ctx.logger.info(`[dry-run] 将从 npm 下载 ${packageName}@${version} 到 ${prefix}`);
    return null;
  }

  const npm = npmRunner(ctx.paths.env);
  ctx.logger.info(`正在从 npm 下载 ${packageName}@${version} ...`);
  mkdirSync(ctx.paths.upstreamDir, { recursive: true });
  const staging = mkdtempSync(join(ctx.paths.upstreamDir, `${name}-${version}.tmp-`));
  const stagedPackage = join(staging, "node_modules", ...packageName.split("/"));
  try {
    ctx.run(
      npm.binary,
      [...npm.prefix, "install", "--prefix", staging, "--ignore-scripts", "--no-save", "--no-audit", "--no-fund", `${packageName}@${version}`],
      { timeout: 120000 },
    );
    readPayload(stagedPackage);
    renameSync(staging, prefix);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return readPayload(packageDir);
}

/**
 * Reinstalls payloads. With registry enabled (default) it first asks npm for a
 * newer package version and installs that into ~/.tern-omp-zh/upstream. Failed or
 * incompatible downloads preserve existing installations; first installs fall back
 * to the bundled payload.
 */
export async function update(ctx, selector = "all", options = {}) {
  const names = selectComponents(selector);
  const registry = options.registry !== false;
  let components = options.upstreamVersions || null;

  if (registry && !components && typeof ctx.fetchImpl === "function") {
    const result = await checkUpstreams(ctx, { timeout: options.timeout });
    components = result.components;
  }

  const updated = [];
  const skipped = [];

  for (const name of names) {
    const bundled = ctx.payloads[name];
    let payload = bundled;
    const entry = components?.[name];
    const latest = entry?.npm?.version || entry?.latest || null;

    if (registry && !latest && isInstalled(ctx, name)) {
      skipped.push({ name, reason: "没有可用的上游版本，保留现有安装" });
      continue;
    }

    if (registry && latest && isNewer(latest, bundled.version) && !ctx.dryRun) {
      try {
        const remote = await installUpstreamPayload(ctx, name, latest);
        if (remote) {
          const remoteEvaluation = evaluate(name, ctx.hosts[name], remote.compat);
          if (remoteEvaluation.compatible === false) {
            ctx.logger.warn(`上游 ${name} ${remote.version} 不支持当前宿主：${remoteEvaluation.reason}`);
            if (isInstalled(ctx, name)) {
              skipped.push({ name, reason: remoteEvaluation.reason });
              continue;
            }
          } else {
            payload = remote;
            ctx.logger.info(`${name} 使用上游版本 ${remote.version}（内置 ${bundled.version}）`);
          }
        }
      } catch (error) {
        ctx.logger.warn(`从 npm 更新 ${name} 失败: ${error.message}`);
        if (isInstalled(ctx, name)) {
          skipped.push({ name, reason: error.message });
          continue;
        }
      }
    } else if (registry && latest && isNewer(latest, bundled.version) && ctx.dryRun) {
      ctx.logger.info(`[dry-run] 上游 ${name} ${latest} 较内置 ${bundled.version} 新，正式运行时会从 npm 下载`);
    }

    if (registry && isInstalled(ctx, name) && isNewer(installedVersion(ctx, name), payload.version)) {
      skipped.push({ name, reason: "更新版本低于现有安装，跳过降级" });
      continue;
    }

    const evaluation = evaluate(name, ctx.hosts[name], payload.compat);
    if (evaluation.compatible === false) {
      ctx.logger.warn(`${name} 当前宿主不兼容，不安装：${evaluation.reason}`);
      skipped.push({ name, reason: evaluation.reason });
      continue;
    }

    ctx.payloads[name] = payload;
    try {
      install(ctx, name, { force: true });
    } catch (error) {
      ctx.payloads[name] = bundled;
      throw error;
    }
    updated.push({ name, version: payload.version, source: payload.dir });
  }

  ctx.state.save();
  return { updated, skipped, components };
}


