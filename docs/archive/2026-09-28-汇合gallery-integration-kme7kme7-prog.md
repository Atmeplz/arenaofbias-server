# 2026-09-28 · 汇合 gallery-integration 进 main · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：Kimi（ZCode CLI 子 agent）

## 本轮目标

把 `origin/gallery-integration`（4 个提交）以 `--no-ff` 合并进本地 `main`（10b7c1c 管理端），两边功能全保留，解决冲突并全面验证；只 commit 不 push。

## 对方 4 个提交摘要

- `51eb3cb` Support the gallery frontend and trusted origins：新增 `POST /api/questions`（社区题目入库）、`PATCH /api/me`（昵称）、`GET /api/me` 扩展（本人题目/近 365 天活跃热图/收到表情）、`POST /api/drafts` 支持 `template=static|vite`（Vite 项目伺服构建目录）；`SITE_ORIGINS` 升级为可信源（凭据 CORS + 写请求 + frame-ancestors，OPTIONS 预检，完整 origin 精确匹配）；新增 `COOKIE_SAME_SITE`（None 必须配 `COOKIE_SECURE=1`）。db.mjs 追加 2 个迁移（questions 表、users.nickname）。新增 questions.mjs、profile.mjs；测试 17→19。
- `6e60906` Update the backend integration documentation：纯文档（HANDOFF/README/api-contract + docs-followup 归档），补联调记录与三仓库职责。
- `2a576e8` Keep matches and votes tied to their original versions：matches/votes 记录创建时的数据包 root/version 与双方身份快照；bootstrap 增加 datapack/catalogDigest/apiVersion/serverVersion；馆藏写操作校验 `X-Datapack-Version`（不匹配 409 `datapack_mismatch`）；新增 datapack 下载/激活/回收脚本（`scripts/datapack*.mjs`）、`npm run check`、`npm run correct:vote --`、PR CI、datapack.json。db.mjs 再追加 2 个迁移（matches/votes 版本与身份列、votes 更正列），到 user_version 5。新增 datapack 测试。
- `ae5b7e1` Score votes only from their saved snapshots：计分只用投票保存的身份快照（含内容 digest），无快照的 legacy 票不计分、缺快照的旧对局不能投票；版本目录被清理后快照释放，令牌失效、投票 410；开发包按 data.json 的 stat 变化才重算哈希。

## 冲突文件与解法

- `HANDOFF.md`：状态与待办两段冲突。合并为如实描述「管理端 + 画廊集成」并存的新版；待办合并去重（推送授权、api-contract 补 admin 两端点、Show1 特色端点、votes.source/users.email、生产部署）。
- `server/app.mjs`：仅 import 行冲突。保留双方：`join, resolve`（管理端 adminDir 用 resolve）与 `execFileSync`（对方 serverVersion 用）。路由表自然合并：我方 `/api/admin/users*` 与对方 `/api/questions`、`PATCH /api/me`、datapack 校验全部保留。
- `server/config.mjs`：dist 默认值冲突。采用对方的 `.datapack/current` 优先逻辑，同时保留我方 `admin`（ADMIN_DIR）配置项。
- `server/auth.mjs`：自动合并成功，人工核对确认我方 `list()`/`setRole()`/`listUsers` 与对方 `updateProfile()`/`setNickname`/cookieSameSite 共存。
- `test/platform.test.mjs`：两边各在 describe 末尾追加测试。保留双方全部用例（我方用户管理 1 个 + 对方题目/昵称/活跃 4 个），仅补回各自测试的闭合括号，未删任何用例。

## 验证

- `npm run check`：25 脚本语法检查 0 错误。
- `npm test`：24/24 通过（我方 12 + 对方 12；platform 16 + datapack 7 + datapack-deploy 1）。
- 冒烟（PORT=5273、CONTENT_PORT=5280、CAPTURE=0、隔离 DATA_DIR，测前杀掉占用 5273/5280 的旧版遗留进程 PID 18676）：
  - `GET /admin/` 200；注册 smokeadmin → `node server/cli.mjs smokeadmin` 提权 → `GET /api/admin/users` 200。
  - `GET /api/bootstrap` 200（含 datapack/apiVersion/serverVersion/questions 字段）；`GET /api/leaderboard` 200；`GET /data.json` 正常，5 题 83 作品。
  - 对方端点：`POST /api/questions` 200、`PATCH /api/me` 200、`GET /api/me` 200（activity/questions 正常）；`POST /api/arena/matches` 200，匿名投票返回 `counted:false, reason:anonymous`；作品内容经令牌子域 200。
  - CORS/可信源：可信源读响应带 `Access-Control-Allow-Origin` + `Allow-Credentials: true` + `Vary: Origin`；`http://example.com` 读响应只有 `Vary` 无许可头、写请求 403；可信源预检 204（允许 `x-datapack-version`），外部源预检 403。
  - `X-Datapack-Version: bogus` 对馆藏题创建对局返回 409 `datapack_mismatch`。
- 测后停止服务，netstat 确认 5273/5280 无监听，隔离数据目录已删。

## 表结构变化

MIGRATIONS 末尾追加 4 步（原迁移不变），新库到 user_version 5：

1. 新建 `questions` 表（id/owner_id/title/summary/prompt/tags/templates/version/created_at + owner 索引）。
2. `users` 加 `nickname TEXT NOT NULL DEFAULT ''`。
3. `matches` 加 `datapack_root`/`datapack_version`/`a_identity`/`b_identity`，`votes` 加 `a_identity`/`b_identity`/`identity_source`（默认 'legacy'），加 `matches_datapack_expiry` 索引。
4. `votes` 加 `a_correction`/`b_correction`。

## 明确没做

- 未 push；未改任何已发布迁移；未动仓库 `.data/` 与 `dist/`（冒烟用隔离目录）。
- 未补 `docs/api-contract.md` 的管理端两个端点（列入待办）。
- 未做公网 HTTPS、跨站 Cookie、真机与自动截图验证。

## 遗留物

- 合并提交 `4304821`（main 本地）；本归档紧随其后一个小提交。
- 根目录无 `.datapack/` 时仍回退读取 `dist/`（当前 83 作品开发包）。

## 下一步建议

- 用户授权后 push main；在 api-contract.md 补记 `GET /api/admin/users` 与 `POST /api/admin/users/:id/role`。
