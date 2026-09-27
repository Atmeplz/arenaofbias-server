# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/archive/` 归档，工作约定见 `AGENTS.md`。

## 当前状态（2026-09-28）

- 本地 `codex/gallery-integration` 接入 same-prompt-gallery 当前平台：新增社区题目发布与目录、昵称、本人题目与近 365 天活跃热图/收到表情、Vite 构建目录投稿。题目表和昵称列只在 MIGRATIONS 末尾追加，原迁移不变。
- `SITE_ORIGINS` 现在同时控制可信前端凭据 CORS、API 写请求和作品嵌入；支持 OPTIONS 预检，完整 origin 精确匹配。Cookie 默认 Lax，跨站 HTTPS 使用 `COOKIE_SAME_SITE=None` + `COOKIE_SECURE=1`；前端 fetch/XHR 必须 include 凭据，媒体相对路径按 API 站点根解析。
- 本轮 `npm test` 19/19 通过（含已有17项平台测试与2项跨origin/会话回归）；README 与 API 契约已同步。未在公网验证，未写原画廊 `.data/`；最终联调与提交由主 agent 统一收尾，未 push。归档 `docs/archive/2026-09-28-gallery-integration-wsnxxxs.md`。

- 本仓库为 Show1×Show2 融合工程的共享后端：唯一动态服务（账号、投票、排行榜、投稿审核、作品沙盒伺服），零 npm 依赖（Node ≥ 22.13 内置模块）。
- 从 same-prompt-gallery 的 platform-fusion 分支拆出建立：`server/` 14 个模块 + `test/` 11 个用例（全部通过）。
- 本地开发数据包 `dist/` 复制自 arenaofbias-data 的 `npm run build:data` 产物（83 作品）；生产环境由数据仓库 CI 提供。
- 冒烟验证（2026-09-27）：`/api/bootstrap`、`/api/leaderboard` 正常；作品内容经令牌子域伺服。

## 待办

- 远端仓库创建与推送：待用户授权（GitHub：kme7kme7-prog/arenaofbias-server）。
- 后续补 Show1 特色端点：猜模型（模一把）、评论、画布/视角校准写回、分享卡。
- votes 表按计划加 `source` 列（娱乐面/正式盲评/历史迁移）；users 表加 `email`/`email_verified_at`/`hash_params` 三列。
- 生产部署需泛域名（`*.w.arenaofbias.icu`）+ 反向代理，未在公网验证，列为早期验证项。

## 红线

- 数据库只经 MIGRATIONS 追加迁移，不手改。
- `.data/`、`dist/`、`node_modules/`、日志为生成物，不提交、不手改。
- 不经用户明确同意不 commit、不 push。

## 本轮浏览器联调结果

2026-09-28主agent使用画廊codex/backend-datapack-integration完成真实跨端口登录、会话刷新、题目发布、昵称、HTML上传/沙盒交互/投稿、审核、盲评、榜单和个人统计。测试目录为画廊output/backend-integration-data，未修改旧数据库，本轮服务已停止；公网HTTPS、跨站Cookie策略、自动截图和真机未验证。详见本轮归档补充。
