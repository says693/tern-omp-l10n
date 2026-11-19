# Tern / omp 中文本地化（npm 包 + 安装 CLI）

本仓库把两套现有汉化拆成可独立发布的 npm 包，并提供一个无第三方依赖的安装/监测 CLI：

## npm 已发布

| 包 | 最新版本 | 用途 |
| --- | --- | --- |
| [`omp-di18n`](https://www.npmjs.com/package/omp-di18n) | `0.1.0` | omp 汉化 payload |
| [`tern-zh-plus`](https://www.npmjs.com/package/tern-zh-plus) | `0.1.0` | Tern 汉化 payload |
| [`tern-omp-l10n`](https://www.npmjs.com/package/tern-omp-l10n) | `0.1.1` | 安装/更新/监测 CLI |

```bash
npx -p tern-omp-l10n l10n status
npx -p tern-omp-l10n l10n install all
```

镜像源同步可能滞后，必要时加 `--registry=https://registry.npmjs.org/` 或设置 `npm_config_registry`。

| 包 | 内容 | 宿主 |
| --- | --- | --- |
| `omp-di18n` | `omp-di18n.ts`、`omp-di18n.zh-CN.json`、`compat.json` | omp `>=19.0.0 <20.0.0` |
| `tern-zh-plus` | `plugin/**` 整套 Tern 插件（含 `compat/`、TSV、Luau）+ `compat.json` | Tern 构建白名单 |
| `tern-omp-l10n` | `l10n` 命令（`status` / `install` / `uninstall` / `update` / `watch` / `autostart`） | Node.js `>=20.11` |

Tern 白名单：`0.9.28 (3e7c863)`、`0.9.23 (35c63ab)`、`0.9.12 (e498b49)`、`0.9.9 (9c1c09f)`。Tern 的兼容判定按**构建号**精确匹配，同版本号但不同构建也视为不兼容。

## 快速开始

```bash
# 查看当前安装与宿主版本
npx -p tern-omp-l10n l10n status

# 安装全部（已有文件先备份为 .backup-<时间戳>）
npx -p tern-omp-l10n l10n install all

# 或只装一个
npx -p tern-omp-l10n l10n install tern
npx -p tern-omp-l10n l10n install omp

# 常驻监测（默认每 30 分钟）
npx -p tern-omp-l10n l10n watch --interval 30m

# 注册 Windows 登录自启
npx -p tern-omp-l10n l10n autostart on
```

也可以全局安装：

```bash
npm install -g tern-omp-l10n
l10n status
```

## 命令

| 命令 | 行为 |
| --- | --- |
| `l10n status [--json]` | 输出组件表，并逐行显示 `Tern 插件版本`、`omp 扩展版本`、`宿主版本`、`兼容性`、备份数。每次都会顺带检查兼容性。 |
| `l10n install [tern\|omp\|all] [--force]` | 从 CLI 内置的 payload 安装。已有目录/文件先移到 `.backup-<YYYYMMDD-HHmmss>`；失败时自动回滚。宿主不兼容时拒绝安装（`--force` 可强制）。 |
| `l10n uninstall [tern\|omp\|all]` | 把已安装插件目录或扩展文件移到同目录备份，不递归删除。 |
| `l10n update [tern\|omp\|all] [--offline]` | 重新同步 payload。默认先查 npm registry：有更新则下载到 `~/.l10n/upstream` 后安装；离线或失败时回退到 CLI 内置版本。 |
| `l10n watch [--interval 30m] [--no-auto-update] [--once]` | 周期检查宿主兼容性并轮询 GitHub releases / npm registry。新版本自动触发 `update`，可用 `--no-auto-update` 关闭。 |
| `l10n autostart on\|off\|status` | 通过 `schtasks` 注册/删除 ONLOGON 任务 `tern-l10n-watch`。失败只提示，不改系统。 |

通用选项：`--dry-run`、`--tern <path>`、`--omp-bin <path>`、`--omp-payload <dir>`、`--tern-payload <dir>`、`--json`、`--quiet`、`--offline`。

`--dry-run` 会演练安装、停用、更新和自启注册，只打印计划，不写文件、不运行 `tern`/`omp`/`npm` 命令。

## 兼容与自动停用

| 组件 | 当前支持 | 失效后的动作 |
| --- | --- | --- |
| Tern | `compat.json` 中的构建白名单 | 优先执行 `tern plugin remove tern-zh-plus`；找不到 CLI 或命令失败时，把插件目录移到 `tern-zh-plus.backup-<时间戳>` |
| omp | `>=19.0.0 <20.0.0` | 把 `omp-di18n.ts`、`omp-di18n.zh-CN.json` 改名为 `*.disabled` |

- 自动停用发生在每次 `status` 和每个 `watch` 周期。
- 日志会写明 `version mismatch: host=<宿主版本>, supported=<支持范围>`。
- 宿主版本检测失败时只显示“未知”，不会误停用。
- 停用只移动或改名，绝不递归删除。条件满足后运行 `l10n install all` 或 `l10n update all` 即可恢复。

状态与日志：

```
~/.l10n/state.json     # 已装版本、停用原因、备份、上游检查结果
~/.l10n/l10n.log       # 所有操作与网络失败都记录在这里
```

安装位置：

```
%APPDATA%\Tern\plugins\tern-zh-plus
%USERPROFILE%\.omp\agent\extensions\omp-di18n.ts
%USERPROFILE%\.omp\agent\extensions\omp-di18n.zh-CN.json
```

## 上游监测

`watch` 每轮以 5 秒超时访问：

- GitHub releases：`losewayy/tern-zh-cn`、`losewayy/omp-di18n`
- npm registry：`tern-zh-plus`、`omp-di18n`

超时、离线、404 只写日志，不会让 `watch` 退出。发现比当前安装/内置版本新的 npm 版本时，自动下载并重装；下载失败则保留现有安装。

## 开发

```bash
npm install                 # 建立 workspace link
node scripts/sync-payload.mjs       # 从本机安装目录同步 payload
node scripts/sync-payload.mjs --check
npm test
node packages/cli/bin/l10n.js status
npm run pack                # npm pack 三个包
```

`scripts/sync-payload.mjs` 只读取这两个安装目录，不修改源：

- `%APPDATA%\Tern\plugins\tern-zh-plus`
- `%USERPROFILE%\.omp\agent\extensions`

同步时排除 `*.exe`、`*.pdb`、`*.log`、`*.bak`、`*.tmp`、`node_modules`、`__pycache__`、`.cache` 等；omp 只同步两个 payload 文件。

## 发布记录

已于 2026-11-19 发布到 npm：

| 包 | 版本 |
| --- | --- |
| `omp-di18n` | `0.1.0` |
| `tern-zh-plus` | `0.1.0` |
| `tern-omp-l10n` | `0.1.1` |

`tern-omp-l10n@0.1.0` 的首次发布被 npm 暂存锁住，实际可用版本为 `0.1.1`。

再次发布：

1. `npm login && npm whoami`（需要 2FA；CI 可用 Read and write 的 granular token）。
2. `node scripts/sync-payload.mjs --check && npm test`。
3. 两个 payload 包升版本后，同步 CLI `dependencies` 中的固定版本。
4. 按依赖顺序发布：

   ```bash
   npm publish -w omp-di18n
   npm publish -w tern-zh-plus
   npm publish -w tern-omp-l10n
   ```

5. npm 偶尔把首次发布转为 staged：等几分钟，或在 npm 的 **Staged Packages** 页面确认；若版本被卡住，直接升 patch 版本重发。

## 许可证

MIT。payload 来自对应的 Tern/omp 汉化项目；`tern-zh-plus` 的插件目录保留原 `LICENSE`、`README.md` 与 `CHANGELOG.md`。
