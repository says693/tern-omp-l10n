/** `l10n status`: table of installed payloads, host versions, compatibility, backups. */
import { evaluate, formatTernBuild } from "./compat.js";
import { enforceCompatibility, installedVersion, isInstalled } from "./installer.js";
import { countBackups, isDirectory, renderTable } from "./util.js";
import { exists } from "./util.js";
import { readdirSync } from "node:fs";

function componentBackups(paths, name) {
  if (name === "tern") {
    let count = 0;
    if (isDirectory(paths.ternPluginsDir)) {
      count += readdirSync(paths.ternPluginsDir).filter((entry) => entry.startsWith("tern-zh-plus.backup-")).length;
    }
    return count;
  }
  let count = 0;
  if (isDirectory(paths.ompDir)) {
    count += readdirSync(paths.ompDir).filter((entry) => /^omp-di18n\..*\.backup-/.test(entry)).length;
  }
  return count;
}

function enabled(ctx, name) {
  if (name === "tern") return isDirectory(ctx.paths.ternTarget) || exists(ctx.paths.ternLinkFile);
  return ctx.paths.ompFiles.some((file) => exists(file));
}

export function describeComponent(ctx, name) {
  const host = ctx.hosts[name];
  const compat = ctx.compat[name];
  const evaluation = evaluate(name, host, compat);
  const installed = isInstalled(ctx, name);
  const record = ctx.state.component[name];
  const active = enabled(ctx, name);

  let status;
  if (!installed && !record.installed && !record.disabled) status = "未安装";
  else if (evaluation.compatible === null) status = active ? "兼容未知（已装）" : "失效（宿主未知）";
  else if (evaluation.compatible === false) status = active ? "不兼容（待停用）" : "失效（已停用）";
  else if (!active) status = "已停用（可 install/update 恢复）";
  else status = "兼容";

  return {
    name,
    label: name === "tern" ? "Tern 汉化" : "omp 汉化",
    installed,
    active,
    version: installed ? installedVersion(ctx, name) : record.installedVersion || "—",
    hostVersion: name === "tern" ? formatTernBuild(host) || "未检测到" : host.version || "未检测到",
    hostBinary: host.binary || null,
    hostError: host.error || null,
    compatible: evaluation.compatible,
    reason: evaluation.reason,
    status,
    disabled: Boolean(record.disabled),
    disabledReason: record.disabledReason || null,
    backups: componentBackups(ctx.paths, name),
  };
}

export function status(ctx, { json = false } = {}) {
  const actions = enforceCompatibility(ctx);
  const rows = ["tern", "omp"].map((name) => describeComponent(ctx, name));

  if (json) {
    return {
      host: {
        tern: ctx.hosts.tern,
        omp: ctx.hosts.omp,
      },
      components: Object.fromEntries(rows.map((row) => [row.name, row])),
      autoDisabled: actions,
      totalBackups: countBackups(ctx.paths),
      stateFile: ctx.paths.stateFile,
      logFile: ctx.paths.logFile,
      dryRun: ctx.dryRun,
    };
  }

  const table = renderTable(
    ["组件", "已装版本", "宿主版本", "兼容/失效", "备份数"],
    rows.map((row) => [row.label, row.version, row.hostVersion, row.status, String(row.backups)]),
  );

  const detailLines = rows.flatMap((row) => {
    const versionLabel = row.name === "tern" ? "Tern 插件版本" : "omp 扩展版本";
    const prefix = row.name === "tern" ? "Tern" : "omp";
    const compatibility = row.compatible === false ? `${row.status} — ${row.reason}` : row.status;
    return [
      `${versionLabel}: ${row.version}`,
      `${prefix} 宿主版本: ${row.hostVersion}`,
      `${prefix} 兼容性: ${compatibility}`,
    ];
  });

  return {
    text: `${table}\n\n${detailLines.join("\n")}`,
    rows,
    actions,
    extra: {
      stateFile: ctx.paths.stateFile,
      logFile: ctx.paths.logFile,
      warnings: rows.filter((row) => row.hostError && row.hostVersion === "未检测到").map((row) => row.hostError),
    },
  };
}
