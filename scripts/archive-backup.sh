#!/usr/bin/env bash
# 每日归档：上传作品、媒体和数据库快照 → 私有仓库 kme7kme7-prog/arenaofbias-archive。
# 数据库用只读连接 VACUUM INTO 出一致性快照（WAL 下安全）；无变化则静默跳过。
# 需要 /root/.ssh/config 里的 github-archive 别名（部署钥只对这个仓库有写权限）。
set -euo pipefail
DATA="${ARCHIVE_DATA_DIR:-/www/wwwroot/arenaofbias-server/.data}"
DIST="${ARCHIVE_DIST_DIR:-/www/wwwroot/arenaofbias-server/.datapack/current}"
REPO="${ARCHIVE_REPO_DIR:-/root/arenaofbias-archive}"
STAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"

cd "$REPO"
git pull --ff-only -q origin main 2>/dev/null || true

# 作品与媒体：整目录镜像后原子替换；git add -A 会记录增删改。
for dir in works media; do
  [ -d "$DATA/$dir" ] || continue
  rm -rf "$REPO/.new-$dir"
  cp -a "$DATA/$dir" "$REPO/.new-$dir"
  rm -rf "$REPO/$dir"
  mv "$REPO/.new-$dir" "$REPO/$dir"
done
# 馆藏（当前数据包，软链指向不可变版本）：解引用后镜像，archive 里就是“全部作品”。
if [ -e "$DIST" ]; then
  rm -rf "$REPO/.new-curated"
  cp -aL "$DIST" "$REPO/.new-curated"
  rm -rf "$REPO/curated"
  mv "$REPO/.new-curated" "$REPO/curated"
fi

# 数据库快照：VACUUM INTO 的目标文件必须不存在。
rm -f "$REPO/platform.db" "$REPO/platform.db-wal" "$REPO/platform.db-shm"
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1], { readOnly: true }); db.exec("VACUUM INTO \x27" + process.argv[2] + "\x27");' "$DATA/platform.db" "$REPO/platform.db"

git add -A
if git diff --cached --quiet; then
  echo "$STAMP no changes"
  exit 0
fi
WORKS=$(find works -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
git -c user.name='arenaofbias-archive' -c user.email='archive@arenaofbias.icu' commit -q -m "archive $STAMP · $WORKS works"
git push -q origin main
echo "$STAMP pushed · $WORKS works"
