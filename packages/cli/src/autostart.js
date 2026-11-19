/** `l10n autostart on|off`: ONLOGON task via schtasks (Windows only). */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TASK_NAME = "tern-l10n-watch";

function query(binary = "schtasks") {
  return execFileSync(binary, ["/Query", "/TN", TASK_NAME, "/FO", "LIST"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function taskCommand() {
  const bin = fileURLToPath(new URL("../bin/l10n.js", import.meta.url));
  return `"${process.execPath}" "${bin}" watch`;
}

export function autostart(ctx, action = "status") {
  const logger = ctx.logger;
  if (ctx.paths.platform !== "win32") {
    logger.warn("autostart 目前只支持 Windows 的 schtasks；其他平台请用 systemd/launchd 调用 `l10n watch`");
    return { ok: false, supported: false };
  }
  if (!["on", "off", "status"].includes(action)) {
    throw new Error(`autostart 只接受 on|off|status，收到: ${action}`);
  }

  if (action === "status") {
    try {
      const output = query();
      logger.plain(output.trim());
      return { ok: true, task: TASK_NAME, output };
    } catch (error) {
      logger.info(`未注册登录自启任务 ${TASK_NAME}${error.status ? ` (schtasks exit ${error.status})` : ""}`);
      return { ok: false, task: TASK_NAME, installed: false };
    }
  }

  if (ctx.dryRun) {
    if (action === "on") logger.info(`[dry-run] schtasks /Create /TN ${TASK_NAME} /SC ONLOGON /TR ${taskCommand()} /F`);
    else logger.info(`[dry-run] schtasks /Delete /TN ${TASK_NAME} /F`);
    return { ok: true, dryRun: true };
  }

  try {
    if (action === "on") {
      const command = taskCommand();
      if (command.length > 260) throw new Error("计划任务命令行超过 260 字符，请缩短 Node/l10n 路径");
      execFileSync(
        "schtasks",
        ["/Create", "/TN", TASK_NAME, "/SC", "ONLOGON", "/TR", command, "/RL", "LIMITED", "/F"],
        { encoding: "utf8", timeout: 15000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      logger.info(`已注册登录自启任务 ${TASK_NAME}: ${command}`);
      ctx.state.record({ action: "autostart-on", task: TASK_NAME, command });
      ctx.state.save();
      return { ok: true, task: TASK_NAME, command };
    }
    execFileSync("schtasks", ["/Delete", "/TN", TASK_NAME, "/F"], {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    logger.info(`已删除登录自启任务 ${TASK_NAME}`);
    ctx.state.record({ action: "autostart-off", task: TASK_NAME });
    ctx.state.save();
    return { ok: true, task: TASK_NAME, removed: true };
  } catch (error) {
    logger.error(`schtasks ${action} 失败: ${error.message}`);
    logger.info(
      "未修改系统。可手动在“任务计划程序”创建 ONLOGON 任务，程序填: " +
        taskCommand().replace(/"/g, ""),
    );
    return { ok: false, task: TASK_NAME, error: error.message };
  }
}
