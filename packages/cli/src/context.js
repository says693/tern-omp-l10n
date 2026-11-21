/** Build the shared command context from CLI options. */
import { createLogger } from "./logger.js";
import { detectHosts } from "./host.js";
import { resolvePaths } from "./paths.js";
import { loadPackageInfo, resolvePayloads } from "./payload.js";
import { StateStore } from "./state.js";
import { runHostCommand } from "./host.js";
import { isInstalled } from "./installer.js";

function installedCompatibility(paths, state, payloads, name, logger) {
  const bundled = payloads[name];
  const record = state.component[name];
  if (!record.installedVersion || !isInstalled({ paths }, name)) return bundled.compat;
  const matches = (payload) => payload?.packageName === bundled.packageName
    && payload.version === record.installedVersion && payload.compat?.host?.[name];
  if (matches(record.installedPayload)) return record.installedPayload.compat;
  if (record.installedVersion === bundled.version) return bundled.compat;
  // Older state files recorded a successful installation's source but no rules.
  if (record.source) {
    try {
      const source = loadPackageInfo(record.source);
      if (matches(source)) return source.compat;
    } catch (error) {
      logger.warn(`无法读取已安装 ${name} ${record.installedVersion} 的兼容规则: ${error.message}`);
    }
  }
  logger.warn(`已安装 ${name} ${record.installedVersion} 的兼容规则未知，不使用内置 ${bundled.version} 的规则自动停用`);
  return null;
}

export function createContext(options = {}) {
  const paths = options.paths ?? resolvePaths(options);
  const logger =
    options.logger ??
    createLogger({
      file: paths.logFile,
      dryRun: Boolean(options.dryRun),
      quiet: Boolean(options.quiet),
      sink: options.sink ?? null,
    });
  const state = new StateStore(paths.stateFile, { dryRun: Boolean(options.dryRun), logger });
  state.load();
  const payloads = options.payloads ?? resolvePayloads(options.payloadOverrides || {});
  const hosts =
    options.hosts ??
    detectHosts({ ternBin: options.ternBin, ompBin: options.ompBin, env: paths.env, paths });

  return {
    paths,
    logger,
    state,
    payloads,
    hosts,
    compat: {
      tern: installedCompatibility(paths, state, payloads, "tern", logger),
      omp: installedCompatibility(paths, state, payloads, "omp", logger),
    },
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    run: options.run ?? runHostCommand,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    now: options.now ?? (() => new Date()),
  };
}
