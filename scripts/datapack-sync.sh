#!/usr/bin/env bash
# 数据包自动同步：arenaofbias-data 的 datapack 分支有新 commit 就换钉、拉取、激活。
# catalog 会惰性感知 current 软链指向变化，无需重启服务。需要 /root/arenaofbias-data 克隆。
set -euo pipefail
ROOT="${DATAPACK_SERVER_ROOT:-/www/wwwroot/arenaofbias-server}"
REPO="${DATAPACK_REPO_DIR:-/root/arenaofbias-data}"

cd "$REPO"
git fetch -q origin datapack
HEAD="$(git rev-parse origin/datapack)"
PIN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/datapack.json', 'utf8')).commit)")"
if [ "$HEAD" = "$PIN" ]; then exit 0; fi

node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('$ROOT/datapack.json', 'utf8')); p.commit = '$HEAD'; fs.writeFileSync('$ROOT/datapack.json', JSON.stringify(p, null, 2) + '\n');"
cd "$ROOT"
npm run --silent fetch:datapack
npm run --silent activate:datapack
echo "$(date -u '+%F %T') activated $HEAD"
