# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/archive/` 归档，工作约定见 `AGENTS.md`。

## 当前状态（2026-09-28）

- 本仓库为 Show1×Show2 融合工程的共享后端：唯一动态服务（账号、投票、排行榜、投稿审核、作品沙盒伺服），零 npm 依赖（Node ≥ 22.13 内置模块）。
- 从 same-prompt-gallery 的 platform-fusion 分支拆出建立：`server/` 14 个模块 + `test/` 12 个用例（全部通过）。
- 本地开发数据包 `dist/` 复制自 arenaofbias-data 的 `npm run build:data` 产物（83 作品）；生产环境由数据仓库 CI 提供。
- 冒烟验证（2026-09-27）：`/api/bootstrap`、`/api/leaderboard` 正常；作品内容经令牌子域伺服。

### 管理端（admin web app，2026-09-28 加入）

- `admin/` 入库的独立单页应用（index.html + admin.js + admin.css + favicon.svg，原生 JS 零依赖），服务在 `/admin/` 下静态伺服（优先于 `dist/` fallback，壳子带站点 CSP）。
- 三个页签：审核（四分类队列 + 核验面板：上传检查/作者试加载报告/试加载 iframe + 通过/存疑/删除）、作品（全部投稿表格 + 状态筛选 + 行内操作）、用户（账号列表 + 角色调整，自己那行禁用）。
- 新增 API：`GET /api/admin/users`（仅 admin，不含 salt/hash）、`POST /api/admin/users/:id/role`（仅 admin；409 防自降权；写 audit 表 action=`role`）。
- 双主题：`data-theme` + localStorage（`admin-theme`），默认暗色（朋友画廊墨色，token 取自 platform-fusion style.css 暗色块）；亮色为 Show1 纸面仪器（token 取自 design-kit.css：纸面三层、酸黄 accent、零圆角切角硬投影）。
- 首个管理员仍由 CLI 授予：`npm run admin -- <用户名>`（或 ADMIN_USERNAMES 环境变量），之后可在用户页自助管理。

## 待办

- 远端仓库创建与推送：待用户授权（GitHub：kme7kme7-prog/arenaofbias-server）。
- 后续补 Show1 特色端点：猜模型（模一把）、评论、画布/视角校准写回、分享卡。
- votes 表按计划加 `source` 列（娱乐面/正式盲评/历史迁移）；users 表加 `email`/`email_verified_at`/`hash_params` 三列。
- 生产部署需泛域名（`*.w.arenaofbias.icu`）+ 反向代理，未在公网验证，列为早期验证项。
- `docs/api-contract.md` 尚未收录 `/api/admin/users*` 两个端点，下一轮补记。

## 红线

- 数据库只经 MIGRATIONS 追加迁移，不手改。
- `.data/`、`dist/`、`node_modules/`、日志为生成物，不提交、不手改。
- 不经用户明确同意不 commit、不 push。
