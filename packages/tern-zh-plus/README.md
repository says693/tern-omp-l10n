# tern-zh-plus

Tern 终端的中英文界面插件 payload。插件目录保留完整的 `plugin.toml`、Luau 启动脚本、CSS、TSV 词表与按构建拆分的 `compat/` 设置页样式。

## 支持范围

`compat.json` 使用**精确构建白名单**：

| Tern 版本 | 构建 | 设置页样式来源 |
| --- | --- | --- |
| 0.9.28 | `3e7c863` | `plugin/compat/0.9.28/` |
| 0.9.23 | `35c63ab` | `plugin/compat/0.9.23/` |
| 0.9.12 | `e498b49` | `plugin/prefs-*.css`（共享/旧版样式） |
| 0.9.9 | `9c1c09f` | `plugin/prefs-*.css` + `plugin/compat/0.9.9/` 差异页 |

同版本号但不同构建（例如 `0.9.28 (deadbee)`）会被判为不兼容，因为设置页 DOM 选择器与固定文案按构建生成。

## 安装

推荐用 CLI：

```bash
npx -p tern-omp-l10n l10n install tern
```

CLI 会先备份已有插件目录为 `tern-zh-plus.backup-<时间戳>`，然后优先调用：

```bash
tern plugin install <payload>/plugin --force
```

找不到 Tern CLI 时直接复制到 `%APPDATA%\Tern\plugins\tern-zh-plus`。手动安装也可以直接用上面的 `tern plugin install` 命令。

安装后打开/重启 Tern 窗口即可生效。`tern plugin list` 应显示 `tern-zh-plus 0.9.0`。

## 自动停用

CLI 的 `status`/`watch` 检测到宿主构建不在白名单时：

1. 优先执行 `tern plugin remove tern-zh-plus`；
2. 找不到 CLI 或命令失败时，把插件目录移到 `tern-zh-plus.backup-<时间戳>`。

日志包含 `version mismatch: host=…, supported=…`。不会删除用户文件。升级 Tern 后若已支持，运行 `l10n install tern` 或 `l10n update tern` 恢复。

## 卸载

```bash
npx -p tern-omp-l10n l10n uninstall tern
```

CLI 会把整个插件目录移到备份。手动卸载可运行 `tern plugin remove tern-zh-plus`；插件自己的缓存位于 `%LOCALAPPDATA%\Tern\plugin-data\tern-zh-plus`，需要时可单独清理。

## 开发

插件源码与兼容性说明见包内 `plugin/README.md`、`plugin/CHANGELOG.md`。根仓库的 `scripts/sync-payload.mjs` 从本机 Tern 安装目录同步整套插件，并排除 exe、日志、缓存等文件。

## 许可证

MIT；插件目录内保留原 `LICENSE`。
