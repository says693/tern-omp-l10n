/** Console + file logging. Never lets a log-write failure break a command. */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function stamp() {
  const now = new Date();
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(
    now.getMinutes(),
  )}:${pad(now.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function createLogger({ file = null, dryRun = false, quiet = false, sink = null, stdout = process.stdout, stderr = process.stderr } = {}) {
  const emit = (level, message) => {
    const line = `${stamp()} ${level.toUpperCase()} ${message}`;
    sink?.(line);
    if (!quiet) (level === "error" ? stderr : stdout).write(`${message}\n`);
    if (dryRun || !file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${line}\n`, "utf8");
    } catch {
      // A read-only home must not prevent status/install from reporting.
    }
  };

  return {
    info: (message) => emit("info", message),
    warn: (message) => emit("warn", message),
    error: (message) => emit("error", message),
    plain: (message) => {
      sink?.(message);
      if (!quiet) stdout.write(`${message}\n`);
    },
    file,
    dryRun,
  };
}
