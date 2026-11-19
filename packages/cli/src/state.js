/** Persisted CLI state (~/.l10n/state.json). */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_SCHEMA = 1;

export function emptyState() {
  return {
    schema: STATE_SCHEMA,
    updatedAt: null,
    components: {
      tern: { installed: false, installedVersion: null, disabled: false },
      omp: { installed: false, installedVersion: null, disabled: false },
    },
    upstream: {},
    history: [],
  };
}

function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    schema: STATE_SCHEMA,
    components: {
      tern: { ...base.components.tern, ...(raw.components?.tern || {}) },
      omp: { ...base.components.omp, ...(raw.components?.omp || {}) },
    },
    upstream: raw.upstream && typeof raw.upstream === "object" ? raw.upstream : {},
    history: Array.isArray(raw.history) ? raw.history.slice(-50) : [],
  };
}

export class StateStore {
  constructor(file, { dryRun = false, logger = null } = {}) {
    this.file = file;
    this.dryRun = dryRun;
    this.logger = logger;
    this.state = emptyState();
  }

  load() {
    try {
      this.state = normalize(JSON.parse(readFileSync(this.file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") this.logger?.warn(`状态文件损坏，已重新开始: ${error.message}`);
      this.state = emptyState();
    }
    return this.state;
  }

  get component() {
    return this.state.components;
  }
  get upstream() {
    return this.state.upstream;
  }

  record(event) {
    this.state.history.push({ at: new Date().toISOString(), ...event });
    if (this.state.history.length > 50) this.state.history.splice(0, this.state.history.length - 50);
  }

  save() {
    if (this.dryRun) return;
    this.state.updatedAt = new Date().toISOString();
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    renameSync(tmp, this.file);
  }
}
