# 本机业务数据备份与恢复

## 已实现的保护

Windows 本机执行 `npm run dev` 或 `npm start` 时，在启动网站前自动备份 `.wrangler/state`。完整保留 D1 数据库、WAL 等侧文件、R2 元数据与照片对象，不只保存源码或导出的成绩表。备份位于项目外的 `../backups/business-data/state-时间-随机编号`，时间使用 UTC。

复制期间独占打开全部源文件；文件被正在运行的网站或其他程序占用时，拒绝备份并清理未完成副本。复制后检查文件列表、SHA-256 和大小，并在临时副本上执行所有 SQLite 数据库的 `PRAGMA integrity_check`，全部通过才发布备份目录。校验临时文件结束后删除。备份期间不要直接启动绕过 npm 脚本的 Wrangler 或其他写入程序。

自动备份失败时输出明确提示，网站继续启动，不能把启动成功当作备份成功。没有自动删除历史备份，避免误删唯一可用副本；需留意磁盘容量。备份没有加密，包含账号数据库与学校业务数据，应按原始数据控制本机访问权限，不上传 GitHub。当前备份仍在同一块磁盘，无法防止整盘损坏。

## 操作命令

停服后手动备份：

```powershell
npm run data:backup
```

核验已有备份：

```powershell
npm run data:verify -- "D:\课外锻炼\backups\business-data\state-实际编号"
```

恢复演练（目标必须是不存在的新目录，其父目录必须已存在）：

```powershell
npm run data:restore -- "D:\课外锻炼\backups\business-data\state-实际编号" "D:\课外锻炼\backups\recovery-check"
```

还原后的数据在目标目录的 `state` 子目录中。恢复工具禁止写入当前业务 state，禁止覆盖已有目标，也禁止在备份目录内恢复。它不会自动替换正式数据。将恢复结果用于业务前，还应在隔离网站验证登录、学院隔离、名单、成绩、归档、照片链接和下载；字节校验及数据库完整性检查不能替代这些业务检查。

演练完删除自己的演练目录；原始备份必须保留。备份失败返回非零退出码，CLI 不会将失败伪装成成功；意外断电留下 `.backup-lock` 时，应先确认没有备份进程，再人工移除该空锁目录后重试。

## 范围与回退

这是本机启动前备份，不是运行期间的每日定时备份，也不覆盖线上 Cloudflare D1/R2。网站一直运行时不会产生周期快照。正式部署、定时任务、异地存储与外部告警仍需根据实际托管服务配置，不在这里宣称已完成。

中央关闭开关：启动网站前设置环境变量 `LOCAL_DATA_BACKUP=0`。只关闭自动备份，手动命令仍可使用；不影响业务数据。PowerShell 当前终端示例：`$env:LOCAL_DATA_BACKUP='0'`，恢复自动备份用 `Remove-Item Env:LOCAL_DATA_BACKUP`。

本次修改前源码快照：`../backups/source-before-data-backup-20261022-000451.zip`。实现集中在 `scripts/data-backup.mjs`、`scripts/copy-offline-state.ps1`、`scripts/start-local.mjs`，启动入口改动在 `scripts/run-framework.mjs` 和 `package.json`。恢复源码时始终保留当前 `.wrangler/state` 与业务备份。

2026-10-22 已完成真实本机快照的校验及独立目录还原，包含 5 个 SQLite 文件、21 个照片对象，共 34 个文件。还原临时目录已删除。报告在 `../reports/data-backup-20261022/verification.json`；这次没有在还原副本上运行完整登录与业务演练。
