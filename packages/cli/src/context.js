/** Build the shared command context from CLI options. */
import { createLogger } from "./logger.js";
import { detectHosts } from "./host.js";
import { resolvePaths } from "./paths.js";
import { resolvePayloads } from "./payload.js";
import { StateStore } from "./state.js";
import { runHostCommand } from "./host.js";

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
      tern: payloads.tern.compat,
      omp: payloads.omp.compat,
    },
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    run: options.run ?? runHostCommand,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    now: options.now ?? (() => new Date()),
  };
}
