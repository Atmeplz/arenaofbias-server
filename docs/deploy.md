# 共享后端部署与回滚

本页记录 2026-09-29 已核实的线上布局。正式目录 `/www/wwwroot/arenaofbias-server` 不是 Git 仓库，代码版本写在 `.server-version`。systemd 服务名为 `arenaofbias-server`，监听 `HOST=127.0.0.1`、`PORT=5273`、`CONTENT_PORT=5180`；目前 `COOKIE_SECURE=1`、`TRUST_PROXY=1`、`CAPTURE=0`。SMTP 由 drop-in `smtp.conf` 配置，Turnstile 尚未配置。当前部署代码为 `a1564ff`，数据包为 `574b17e006ef2955b8b4a267192828e2aa63d7f8`，数据库 v14。每日 cron 运行 `/root/archive-backup.sh`，以 restic 加密归档。以下步骤需要在有权操作服务的服务器终端执行；先完成 PR 审阅和部署排期。

## 1. 备份与检出

部署前确认 `df -h` 有足够空间，并记录旧版本、数据包指针和数据库版本。以下命令在服务器上以有权限的账号执行。备份目录只保存在服务器受限路径，不传到仓库。

```bash
set -euo pipefail
live=/www/wwwroot/arenaofbias-server
backup=/root/arenaofbias-predeploy-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
cat "$live/.server-version" > "$backup/server-version"
readlink -f "$live/.datapack/current" > "$backup/datapack-current"
node -e 'const {DatabaseSync}=require("node:sqlite"); const db=new DatabaseSync(process.argv[1],{readOnly:true}); const target=process.argv[2].replaceAll("\u0027","\u0027\u0027"); db.exec("VACUUM INTO \u0027"+target+"\u0027"); db.close();' "$live/.data/platform.db" "$backup/platform.db"
tar -C "$live" --exclude='./.git' --exclude='./.data' --exclude='./.datapack' --exclude='./output' -czf "$backup/code.tar.gz" .
```

数据库先做一致性快照，代码另行打包。投稿文件与媒体由现有每日 restic 归档保存；若本次变更会改动它们，另做同步文件备份。当前仓库的 `scripts/archive-backup.sh` 已先 `VACUUM INTO`，再把 `works`、`media`、数据包和快照交给 restic。恢复较早数据库时，多出的作品目录会在服务启动时移至 `.data/orphans`。

在服务器克隆到临时目录、检出明确的目标 SHA 并运行门禁：

```bash
target_sha=<经过审阅的完整提交 SHA>
stage=/root/arenaofbias-deploy-$target_sha
git clone https://github.com/kme7kme7-prog/arenaofbias-server.git "$stage"
git -C "$stage" checkout --detach "$target_sha"
(cd "$stage" && npm run check && npm test)
old_sha=$(cat "$backup/server-version")
git -C "$stage" cat-file -e "$old_sha^{commit}"
git -C "$stage" diff --name-status --diff-filter=DR "$old_sha" "$target_sha"
```

最后一条命令列出被删除或改名的旧文件。若有输出，先逐项确认、记录并安排清理；直接 tar 覆盖不会移除旧文件。确认清单为空或已完成处理后才覆盖。`.server-version` 在覆盖完成并确认代码 SHA 后写入：

```bash
tar -C "$stage" --exclude='./.git' --exclude='./.data' --exclude='./.datapack' --exclude='./.server-version' --exclude='./output' -cf - . | tar -C "$live" -xf -
printf '%s\n' "$target_sha" > "$live/.server-version"
```

## 2. 数据包

优先从数据仓的不可变发布包安装。`datapack.json.commit` 须为本次目标产物 SHA；安装完成后先检查目录，再激活。

```bash
cd "$live"
npm run fetch:datapack
npm run activate:datapack
```

服务器从 GitHub 下载约 150 MB 数据包可能卡住，本机上传也只有约 20 KB/s。此时在本机用**两个已安装版本目录**生成仅含变化文件、删除清单、旧树与目标树 SHA-256 的差异包；先在本机试应用一次。示例路径须改为实际绝对路径，目标目录不能已存在：

```bash
node scripts/datapack-delta.mjs create <旧版本目录> <新版本目录> <差异包.gz>
node scripts/datapack-delta.mjs apply <旧版本目录> <差异包.gz> <本机临时目标目录>
node scripts/datapack-delta.mjs verify <本机临时目标目录> <差异包.gz>
```

把差异包传至服务器后，使用服务器已安装的旧版本重建新版本。不要在当前链接指向的目录上原地覆盖。应用命令在完整目录树校验失败时删除暂存目录并拒绝生成目标版本；激活前再校验一次。

```bash
old_pack=$(cat "$backup/datapack-current")
new_pack="$live/.datapack/versions/$(node -p "require('$live/datapack.json').commit")"
delta=/root/<差异包.gz>
node "$live/scripts/datapack-delta.mjs" apply "$old_pack" "$delta" "$new_pack"
node "$live/scripts/datapack-delta.mjs" verify "$new_pack" "$delta"
(cd "$live" && npm run activate:datapack)
```

若目标目录已有半成品，先调查来源；差异脚本会拒绝覆盖。传输或文件被篡改时校验失败，不能激活。以后定期运行 `npm run prune:datapack` 预览，再按需运行 `npm run prune:datapack -- --apply`；它会保留当前、pin 和仍被对局引用的版本。

## 3. 重启和验收

```bash
systemctl daemon-reload
systemctl restart arenaofbias-server
systemctl status arenaofbias-server --no-pager
journalctl -u arenaofbias-server -n 100 --no-pager
curl -fsS http://127.0.0.1:5273/api/bootstrap
```

检查 JSON 的 `serverVersion` 等于目标代码 SHA，`datapack` 等于目标产物 SHA，并核对 `catalogDigest`、作品数和关键登录/榜单接口。代码部署目录没有 `.git`，所以 `.server-version` 是 `serverVersion` 的依据。`COOKIE_SECURE=1` 下本轮会话 Cookie 改为 `__Host-sp_session`，上线会让所有用户登出一次。若本轮含数据库迁移，重启时自动执行追加迁移，部署前须另核对迁移版本；数据库不能靠切回旧代码自动降级。

## 4. 回滚

先停止服务，把当前 `.data/platform.db` 和现有代码另存以便调查。恢复备份的代码和数据库，恢复旧数据包链接，确认 `.server-version`，再启动服务。若新版本已经产生业务写入，恢复旧数据库会丢弃这段时间的写入；应先决定是否做人工数据恢复。跨数据库版本回滚必须使用兼容旧代码的备份。

```bash
systemctl stop arenaofbias-server
tar -C "$live" -xzf "$backup/code.tar.gz"
cp "$backup/platform.db" "$live/.data/platform.db"
ln -sfn "$(cat "$backup/datapack-current")" "$live/.datapack/current"
cp "$backup/server-version" "$live/.server-version"
systemctl start arenaofbias-server
systemctl status arenaofbias-server --no-pager
curl -fsS http://127.0.0.1:5273/api/bootstrap
```

若新版本删除或改名了旧代码文件，回滚前按第 1 节记录的清单恢复或清理；tar 解包也不会自动删除新增文件。`.data/works` 与 `.data/media` 不随代码覆盖，必要时从 restic 日备份恢复。

## 5. 运维文件

仓库更新归档脚本后，安装到 cron 现用位置并检查权限。它使用 `/root/.archive-restic-password` 和现有 restic 仓库，部署不应重写密钥。

```bash
install -m 700 "$live/scripts/archive-backup.sh" /root/archive-backup.sh
```

Turnstile 目前未启用。待取得站点密钥与服务端密钥后，可另建 systemd drop-in；下列值仅是占位符：

```ini
# /etc/systemd/system/arenaofbias-server.service.d/turnstile.conf
[Service]
Environment="TURNSTILE_SITE_KEY=<site-key>"
Environment="TURNSTILE_SECRET_KEY=<secret-key>"
```

写入后执行 `systemctl daemon-reload`、重启服务，并通过 `/api/auth/turnstile` 核对站点密钥。SMTP 仍由现有 `smtp.conf` 提供。
