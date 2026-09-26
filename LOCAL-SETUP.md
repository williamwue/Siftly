# 个人维护版 Siftly

本地地址：http://127.0.0.1:7310/bookmarks 。项目保留上游完整历史；`main` 保存个人维护版本，`upstream` 指向原作者仓库。公开 fork 为 https://github.com/williamwue/Siftly ，`origin` 指向该仓库。

## 安装与运行

使用 Node.js 20.9 或更新版本、npm；数据备份脚本需要 Python 3。在仓库根目录运行：

```sh
npm ci
cp .env.example .env.local # 仅首次安装；已有配置不要覆盖
npx prisma generate
npx prisma migrate deploy
npm run build
./start-local.command
```

启动脚本只监听 127.0.0.1:7310，在当前终端前台运行；没有开机自启。开发时使用 `npm run dev -- --hostname 127.0.0.1 --port 7310`，先停止同端口的生产服务。

当前个人配置使用 `prisma/dev.db`，并在 `.env.local` 设置 `AUTO_CATEGORIZE_AFTER_IMPORT=false`。导入页面可能主动触发分类；已有人工分类时不要无范围重跑分类。模型密钥在本地设置，不写入 Git。

## 代码与数据

Git 保存源代码、锁文件、迁移、脚本和文档。`.local/` 保存导入原文、复核映射和运行报告；数据库、备份与 `.env` 文件均被忽略。Git 不备份这些私有数据。

2026-09-14 增量导入后共有 8,111 条书签；本次新增 16 条，其中 15 条已分类、1 条待复核。详情在 `.local/x-sync-20260914/final-report.json`；更早操作记录保留在 `.local/LOCAL-SETUP-history-20260914.md`。这些是当时快照。

更改数据库或升级前运行：

```sh
python3 scripts/backup-local.py
```

脚本通过 SQLite 在线备份保存一致快照，并检查完整性和外键。默认写到 `.local/backups/`，不会清理旧备份。可传入外置磁盘的目录作为第一个参数。同一磁盘的备份不能抵御磁盘损坏；另行保留 `.local/`（含人工复核映射）和 `.env.local` 的私有副本。数据库也可能包含服务凭据，不要上传公开仓库。

恢复时先停止 Siftly，备份当前库，再将选定的备份复制为 `prisma/dev.db`，处理旧库残留的 `dev.db-wal`/`dev.db-shm` 后重启。仅在服务已停止且旧库已备份时处理这些残留文件。

## 日常迭代

```sh
git switch -c feat/your-change
# 完成修改后
npm test
npx tsc --noEmit
git diff --check
git add <本次修改的文件>
git commit -m "说明本次行为变化"
```

构建验证时先停止正在使用 `.next` 的服务，再执行 `npm run build` 并重新启动。合并回 `main` 前检查实际页面与分类搜索。

更新上游时先备份数据，在工作区干净的情况下：

```sh
git fetch upstream
git switch -c chore/upstream-update
git merge upstream/main
```

解决冲突并验证后再合并到个人 `main`。发布个人版本时推送到 `origin`，保留 `upstream` 用于获取原作者更新。上游许可证保持不变。

当前基线保留中文分类、Unicode slug、X 导入作者缺失的兼容修正，以及 Next.js 16.3.5 和同步锁文件。依赖安全审计尚未全面解决，历史详情见本机操作记录。
