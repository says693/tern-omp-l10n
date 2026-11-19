/** Small fs/format helpers shared by installer, status, and watch. */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

export function compactTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

export function exists(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function uniquePath(path) {
  if (!exists(path)) return path;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${path}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error(`cannot find a free backup path near ${path}`);
}

export function backupName(path, timestamp = compactTimestamp()) {
  return uniquePath(`${path}.backup-${timestamp}`);
}

export function moveToBackup(path, timestamp = compactTimestamp()) {
  const destination = backupName(path, timestamp);
  renameSync(path, destination);
  return destination;
}

export function copyTree(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  return destination;
}

export function countBackups(paths) {
  let count = 0;
  const inspect = (dir, predicate) => {
    if (!isDirectory(dir)) return;
    for (const entry of readdirSync(dir)) if (predicate(entry)) count++;
  };
  inspect(paths.ternPluginsDir, (entry) => entry.startsWith("tern-zh-plus.backup-"));
  inspect(paths.ompDir, (entry) => /^omp-di18n\..*\.backup-/.test(entry));
  return count;
}


export function backupFile(path, timestamp = compactTimestamp()) {
  const destination = backupName(path, timestamp);
  renameSync(path, destination);
  return destination;
}

/** Width-aware table for CJK text. */
function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff);
    width += wide ? 2 : 1;
  }
  return width;
}

function padCell(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

export function renderTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(displayWidth(header), ...rows.map((row) => displayWidth(row[index] ?? ""))),
  );
  const line = (cells) => `| ${cells.map((cell, index) => padCell(String(cell ?? ""), widths[index])).join(" | ")} |`;
  return [line(headers), `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`, ...rows.map(line)].join("\n");
}
