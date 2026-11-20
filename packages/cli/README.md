# tern-omp-zh

`zh` 命令：安装、更新、监测 Tern / omp 汉化，并在宿主升级导致不兼容时安全停用。

无第三方依赖，Node.js `>=20.11`，ESM。

## 安装

```bash
npx -p tern-omp-zh zh status
# 或
npm install -g tern-omp-zh
zh install all
```

包内已经包含两个 payload 包（`omp-di18n`、`tern-zh-plus`），安装时不需要联网。

## 命令

### `zh status [--json]`

输出组件表，并逐行打印：

```
Tern 插件版本: 0.9.1 (plugin.toml)
Tern 宿主版本: 0.9.29 (379ecc4)
Tern 兼容性: 兼容
omp 扩展版本: 0.1.0
omp 宿主版本: 19.0.0
omp 兼容性: 兼容
```

同时检查兼容性；若当前汉化不支持宿主，会先执行自动停用（见下）。`--json` 输出宿主检测结果、每个组件的详细状态、自动停用动作和备份总数。

### `zh install [tern|omp|all] [--force]`

- 已有插件目录/扩展文件先移动为 `<名称>.backup-<YYYYMMDD-HHmmss>`。
- Tern：优先运行 `tern plugin install <payload>/plugin --force`；找不到 Tern CLI 时直接复制到 `%APPDATA%\Tern\plugins\tern-zh-plus`。
- omp：复制 `omp-di18n.ts` 与 `omp-di18n.zh-CN.json` 到 `%USERPROFILE%\.omp\agent\extensions`。
- 任一步失败会恢复备份，不会留下半套安装。
- 宿主不兼容时拒绝安装；`--force` 才强制写入。

### `zh uninstall [tern|omp|all]`

把插件目录/扩展文件移到同目录的 `.backup-<时间戳>`，不递归删除。Tern 会尝试 `tern plugin reload` 卸载已加载的插件。

### `zh update [tern|omp|all] [--offline]`

重新安装 payload。默认查询 npm registry：

1. 若 npm 上有比内置版本更新的包，下载到 `~/.tern-omp-zh/upstream/<组件>-<版本>` 并安装；
2. 离线、404、超时或下载失败时回退到 CLI 内置 payload；
3. 上游新版本若声明不支持当前宿主，则回退到内置版本。

`--offline` 完全跳过 registry。

### `zh watch [--interval 30m] [--no-auto-update] [--once]`

常驻循环：

- 每轮重新检测 `tern --version` / `omp --version`；
- 不兼容时自动停用，并写日志：
  `version mismatch: host=<宿主版本>, supported=<支持范围>`；
- 默认轮询 GitHub releases（`losewayy/tern-zh-cn`、`losewayy/omp-di18n`）与 npm registry（`tern-zh-plus`、`omp-di18n`），每次请求 5 秒超时；
- 超时/离线只记日志，不崩溃；
- 发现新版本且当前未尝试过时调用 `update`；`--no-auto-update` 只保留兼容性检查；
- `--once` 只跑一轮，便于测试/计划任务。

### `zh autostart on|off|status`

Windows 下通过 `schtasks` 注册 ONLOGON 任务 `tern-omp-zh-watch`，运行当前 Node + `zh.js watch`。注册或删除失败只打印提示，不会强改系统。

## 安全模型

- 自动停用只做两类操作：调用 Tern 自己的 `plugin remove`，或把文件/目录移动到 `.backup-<时间戳>` / 改名为 `.disabled`。没有递归删除。
- 所有改动路径都可用 `--dry-run` 演练：不写状态、不写日志、不运行 `tern`/`omp`/`npm`。
- 状态文件：`~/.tern-omp-zh/state.json`；日志：`~/.tern-omp-zh/zh.log`。日志写失败不会阻断命令。
- 宿主版本检测失败（命令不存在/输出无法解析）视为“未知”，不会自动停用。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `TERN_OMP_ZH_HOME` | 覆盖用户主目录（同时影响默认 omp/state 路径） |
| `TERN_OMP_ZH_APPDATA` | 覆盖 `%APPDATA%` |
| `TERN_OMP_ZH_STATE_DIR` | 覆盖状态与日志目录 |
| `TERN_BIN` / `OMP_BIN` | 指定宿主可执行文件 |

## 开发

```bash
npm test
node bin/zh.js status
node bin/zh.js install all --dry-run
```

单元测试覆盖：版本解析与 semver 范围、兼容判定、临时目录安装/备份/回滚、不兼容自动停用、离线 watch 不崩溃、CLI `--dry-run` 不落盘。
