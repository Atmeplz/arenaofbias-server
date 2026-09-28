# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/archive/` 归档，工作约定见 `AGENTS.md`。

## 当前状态（2026-09-28，main 已合并 gallery-integration）

- 本仓库为 Show1×Show2 融合工程的共享后端：唯一动态服务（账号、投票、排行榜、投稿审核、作品沙盒伺服），零 npm 依赖（Node ≥ 22.13 内置模块）。`same-prompt-gallery` 提供静态画廊前端；`arenaofbias-data` 构建馆藏数据包；本仓库提供唯一动态 API、数据库和投稿作品沙盒。
- main 与 gallery-integration 自 bbaf0d7 分叉后汇合：管理端（见下节）与画廊集成/版本化对局/快照计分全部保留。数据库追加迁移至 user_version 5（questions 表、users.nickname、matches/votes 版本与身份快照列、votes 更正列），原迁移不变。
- 画廊集成（原 51eb3cb）：社区题目发布与目录（`POST /api/questions`、`bootstrap.questions`）、昵称（`PATCH /api/me`）、`GET /api/me` 近 365 天活跃热图/收到表情、Vite 构建目录投稿（`template=static|vite`）。`SITE_ORIGINS` 同时控制可信前端凭据 CORS、API 写请求与作品嵌入，支持 OPTIONS 预检；Cookie 默认 Lax，跨站 HTTPS 用 `COOKIE_SAME_SITE=None` + `COOKIE_SECURE=1`。
- 版本化对局与快照计分（原 2a576e8 + ae5b7e1）：bootstrap 返回 datapack 版本/目录摘要/API v1/后端提交；馆藏相关写操作校验 `X-Datapack-Version`；matches/votes 绑定创建时的数据包版本与身份快照（含内容 digest），仅按保存的快照计分，legacy 票不计分；数据包安装/激活/回收脚本（`npm run fetch:datapack` 等）、`npm run check`、`npm run correct:vote -- <票id>`、PR CI 已接入。默认读取 `.datapack/current`，无该路径时兼容 `dist/`。
- 冒烟验证（2026-09-28 合并后）：`npm test` 全绿；`/admin/`、注册→提权→`/api/admin/users`、`/api/bootstrap`、`/api/leaderboard`、可信源 CORS 预检均验证通过。详见 `docs/archive/2026-09-28-汇合gallery-integration-kme7kme7-prog.md`。

### 管理端（admin web app，2026-09-28 加入）

- `admin/` 入库的独立单页应用（index.html + admin.js + admin.css + favicon.svg，原生 JS 零依赖），服务在 `/admin/` 下静态伺服（优先于 `dist/` fallback，壳子带站点 CSP）。
- 三个页签：审核（四分类队列 + 核验面板：上传检查/作者试加载报告/试加载 iframe + 通过/存疑/删除）、作品（全部投稿表格 + 状态筛选 + 行内操作）、用户（账号列表 + 角色调整，自己那行禁用）。
- 新增 API：`GET /api/admin/users`（仅 admin，不含 salt/hash）、`POST /api/admin/users/:id/role`（仅 admin；409 防自降权；写 audit 表 action=`role`）。
- 双主题：`data-theme` + localStorage（`admin-theme`），默认暗色（朋友画廊墨色，token 取自 platform-fusion style.css 暗色块）；亮色为 Show1 纸面仪器（token 取自 design-kit.css：纸面三层、酸黄 accent、零圆角切角硬投影）。
- 首个管理员仍由 CLI 授予：`npm run admin -- <用户名>`（或 ADMIN_USERNAMES 环境变量），之后可在用户页自助管理。

## 待办

- 远端 `https://github.com/kme7kme7-prog/arenaofbias-server.git` 已配置；main 与合并提交均未 push，推送待用户授权。
- `docs/api-contract.md` 已由对方分支收录画廊集成端点（/api/questions、PATCH /api/me 等）与数据包版本字段；仍缺 `/api/admin/users` 与 `/api/admin/users/:id/role` 两个管理端端点，下一轮补记。
- 后续补 Show1 特色端点：猜模型（模一把）、评论、画布/视角校准写回、分享卡。
- votes 表按计划加 `source` 列（娱乐面/正式盲评/历史迁移）；users 表加 `email`/`email_verified_at`/`hash_params` 三列。
- 生产部署需确定 API 与作品源域名（泛域名 `*.w.arenaofbias.icu`）、证书与反向代理；公网尚未验证，列为早期验证项。

## 红线

- 数据库只经 MIGRATIONS 追加迁移，不手改。
- `.data/`、`dist/`、`.datapack/`、`node_modules/`、日志为生成物，不提交、不手改。
- 不经用户明确同意不 commit、不 push。

## 本轮浏览器联调记录（画廊集成时）

主 agent 使用画廊 `backend-datapack-integration` 与后端 gallery-integration 分支完成跨端口联调（登录与刷新、题目发布、昵称、HTML 投稿/沙盒交互、审核、盲评、榜单与个人统计）；隔离测试目录为画廊 `output/backend-integration-data`。联调详情见 `docs/archive/2026-09-28-gallery-integration-wsnxxxs.md` 末尾补充；后续文档更正见 docs-followup 归档。
