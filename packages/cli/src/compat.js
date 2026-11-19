/** Compatibility rules evaluated against detected host versions. */
import { satisfies } from "./semver.js";

export function formatTernBuild(host) {
  if (!host?.version) return null;
  return host.build ? `${host.version} (${host.build})` : host.version;
}

export function evaluateTern(host, compat) {
  const rule = compat?.host?.tern;
  if (!host?.version) {
    return { compatible: null, label: "未知", reason: `无法检测 Tern 版本${host?.error ? ` (${host.error})` : ""}` };
  }
  if (!rule?.builds?.length && !rule?.versions?.length) {
    return { compatible: false, label: "不兼容", reason: "compat.json 缺少 Tern 规则" };
  }

  const label = formatTernBuild(host);
  if (host.build) {
    if (rule.builds?.includes(label)) {
      return { compatible: true, label, reason: `构建 ${label} 在白名单中` };
    }
    return {
      compatible: false,
      label,
      reason: `Tern 构建 ${label} 不在白名单 (${rule.builds?.join(", ") || "无"})`,
    };
  }
  if (rule.versions?.includes(host.version)) {
    return { compatible: true, label, reason: `版本 ${host.version} 在白名单中（无构建号）` };
  }
  return {
    compatible: false,
    label,
    reason: `Tern 版本 ${host.version} 不在白名单 (${rule.versions?.join(", ") || "无"})`,
  };
}

export function evaluateOmp(host, compat) {
  const rule = compat?.host?.omp;
  if (!host?.version) {
    return { compatible: null, label: "未知", reason: `无法检测 omp 版本${host?.error ? ` (${host.error})` : ""}` };
  }
  if (!rule?.range) {
    return { compatible: false, label: host.version, reason: "compat.json 缺少 omp 范围" };
  }
  const compatible = satisfies(host.version, rule.range);
  return {
    compatible,
    label: host.version,
    reason: compatible ? `omp ${host.version} 满足 ${rule.range}` : `omp ${host.version} 不满足 ${rule.range}`,
  };
}

export function evaluate(name, host, compat) {
  return name === "tern" ? evaluateTern(host, compat) : evaluateOmp(host, compat);
}
