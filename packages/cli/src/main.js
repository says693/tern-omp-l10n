/** CLI entry point: argument parsing and command dispatch. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { autostart } from "./autostart.js";
import { createContext } from "./context.js";
import { install, uninstall } from "./installer.js";
import { status } from "./status.js";
import { update } from "./update.js";
import { defaultRefreshHosts, runWatch } from "./watch.js";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `tern-omp-l10n ${VERSION} — Tern / omp 汉化安装与监测

用法:
  l10n status [--json]
  l10n install [tern|omp|all] [--force]
  l10n uninstall [tern|omp|all]
  l10n update [tern|omp|all] [--offline]
  l10n watch [--interval 30m] [--no-auto-update] [--once]
  l10n autostart on|off|status

通用选项:
  --dry-run              只打印将执行的操作，不写文件、不运行宿主命令
  --tern <path>          指定 tern 可执行文件（默认依次探测 PATH、H:\\Tern、%LOCALAPPDATA%\\Tern）
  --omp-bin <path>       指定 omp 可执行文件
  --omp-payload <dir>    使用指定 omp-di18n 包目录
  --tern-payload <dir>   使用指定 tern-zh-plus 包目录
  --json                 机器可读输出（status）
  --quiet                不输出到终端（仍写日志）
  --offline              不访问 npm registry / GitHub（update）
  -h, --help             显示帮助
  -v, --version          显示 CLI 版本

说明:
  install/uninstall 的备份命名为 <路径>.backup-<YYYYMMDD-HHmmss>。
  status 与 watch 检测到宿主版本不受支持时，会自动停用汉化（移动/改名，不删除）。
  状态与日志: ~/.l10n/state.json、~/.l10n/l10n.log
`;

function fail(message) {
  const error = new Error(message);
  error.userFacing = true;
  throw error;
}

function componentArg(values) {
  const positional = values.positionals?.[1];
  if (positional && !["tern", "omp", "all"].includes(positional)) {
    fail(`未知组件: ${positional}（可用 tern|omp|all）`);
  }
  return positional || "all";
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        "dry-run": { type: "boolean" },
        json: { type: "boolean" },
        force: { type: "boolean" },
        interval: { type: "string" },
        "no-auto-update": { type: "boolean" },
        once: { type: "boolean" },
        tern: { type: "string" },
        "omp-bin": { type: "string" },
        "omp-payload": { type: "string" },
        "tern-payload": { type: "string" },
        offline: { type: "boolean" },
        quiet: { type: "boolean" },
        verbose: { type: "boolean" },
      },
    });
  } catch (error) {
    process.stderr.write(`参数错误: ${error.message}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (values.help || !positionals.length) {
    process.stdout.write(HELP);
    return;
  }

  const command = positionals[0];
  const dryRun = Boolean(values["dry-run"]);
  const common = {
    dryRun,
    quiet: Boolean(values.quiet),
    force: Boolean(values.force),
  };
  values.positionals = positionals;

  let ctx = null;
  const makeContext = () => {
    ctx ??= createContext({
      ...common,
      paths: undefined,
      ternBin: values.tern,
      ompBin: values["omp-bin"],
      payloadOverrides: {
        ompPayloadDir: values["omp-payload"],
        ternPayloadDir: values["tern-payload"],
      },
    });
    return ctx;
  };

  try {
    switch (command) {
      case "status": {
        const context = makeContext();
        const result = status(context, { json: Boolean(values.json) });
        if (values.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          process.stdout.write(`${result.text}\n`);
          for (const warning of result.extra.warnings) process.stderr.write(`宿主检测提示: ${warning}\n`);
          process.stdout.write(`状态文件: ${result.extra.stateFile}\n日志: ${result.extra.logFile}\n`);
        }
        break;
      }

      case "install": {
        const context = makeContext();
        install(context, componentArg({ positionals }), { force: Boolean(values.force) });
        if (dryRun) context.logger.info("dry-run 完成：未写入任何文件");
        break;
      }

      case "uninstall": {
        const context = makeContext();
        uninstall(context, componentArg({ positionals }));
        break;
      }

      case "update": {
        const context = makeContext();
        const result = await update(context, componentArg({ positionals }), {
          registry: !values.offline,
        });
        if (!result.updated.length) context.logger.warn("没有组件被更新");
        break;
      }

      case "watch": {
        const context = makeContext();
        const refreshHosts = defaultRefreshHosts(context, {
          ternBin: values.tern,
          ompBin: values["omp-bin"],
        });
        await runWatch(context, {
          interval: values.interval ?? "30m",
          once: Boolean(values.once),
          autoUpdate: !values["no-auto-update"],
          refreshHosts,
        });
        break;
      }

      case "autostart": {
        const context = makeContext();
        const action = positionals[1] || "status";
        const result = autostart(context, action);
        if (!result.ok && action !== "status") process.exitCode = 1;
        break;
      }

      default:
        fail(`未知命令: ${command}`);
    }
  } catch (error) {
    const logger = ctx?.logger;
    if (logger) logger.error(error.userFacing ? error.message : error.stack || error.message);
    else process.stderr.write(`${error.userFacing ? error.message : error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
