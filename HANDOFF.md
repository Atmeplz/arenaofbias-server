# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/archive/` 归档，工作约定见 `AGENTS.md`。

## 当前状态（2026-09-28）

- **快照计分与复查修复已完成**（随本轮英文提交，未 push；归档 `docs/archive/2026-09-28-snapshot-only-scoring-wsnxxxs.md`）：用户确认现有投票均为测试数据、没有需要保留的旧票，因此 legacy 票不再计分，缺少身份快照的旧对局不能投票。身份快照新增内容摘要 `digest`；开发包仅在 `data.json` 的 stat 变化时重新计算哈希；版本目录被清理后释放快照，令牌返回空、投票返回 410。本地分支已改名为 `gallery-integration`。check 25、test 23 通过；前端跨仓 smoke 以本工作区通过。
- **本轮版本与历史投票保护已完成**：随本轮英文提交，未 push。安装器按 datapack.json 写不可变版本目录，activate 切换链接，prune 默认预演、按最后对局过期时间加一小时宽限期回收；真实版本目录与身份快照持久绑定 matches，重启后仍可读取旧对局资源。votes 原始快照不变，显式更正单独保存并审计，旧票明确 legacy。追加迁移到 user_version 5。
- bootstrap 返回实际产物 SHA、原始目录摘要、API v1、后端提交；馆藏相关新写操作拒绝已声明的不匹配版本。共享零依赖下载器、PR 检查、管理员纠错命令已接入。默认读取 `.datapack/current`，无该路径时兼容 dist。
- 本轮语法检查 25 脚本、npm test 23 项、固定包/新本地包两次真实 HTTP 跨仓 smoke 通过；浏览器验收见前端归档。原 `.data` 未动，临时数据在 output/release-review-data。详见 `docs/archive/2026-09-28-versioned-matches-wsnxxxs.md`。

- 本地 `gallery-integration` 接入 same-prompt-gallery 当前平台：新增社区题目发布与目录、昵称、本人题目与近 365 天活跃热图/收到表情、Vite 构建目录投稿。题目表和昵称列只在 MIGRATIONS 末尾追加，原迁移不变。
- `SITE_ORIGINS` 现在同时控制可信前端凭据 CORS、API 写请求和作品嵌入；支持 OPTIONS 预检，完整 origin 精确匹配。Cookie 默认 Lax，跨站 HTTPS 使用 `COOKIE_SAME_SITE=None` + `COOKIE_SECURE=1`；前端 fetch/XHR 必须 include 凭据，媒体相对路径按 API 站点根解析。
- 后端功能已在本地 `gallery-integration` 提交 `51eb3cb`（`Support the gallery frontend and trusted origins`），配套前端分支功能提交为 `1ee5dae`；均未获 push 授权。本轮文档续补另以英文 commit 提交，记录见 `docs/archive/2026-09-28-gallery-integration-docs-followup-wsnxxxs.md`。
- 功能提交前 `npm test` 19/19、语法和 diff 检查通过；主 agent 后续以画廊 `localhost:4175`、API `localhost:5190`、作品源 `*.localhost:5191` 完成真实浏览器联调。验证覆盖登录与刷新、题目发布、昵称、HTML 投稿/沙盒交互、审核、盲评、榜单与个人统计；未验证公网 HTTPS、跨站 Cookie 策略、真机、自动截图及全部原作交互。旧画廊 `.data/` 未写入，本轮服务已停止。
- 三仓库职责：`same-prompt-gallery` 提供静态画廊与前端；`arenaofbias-server` 提供唯一动态 API、数据库和投稿作品沙盒；`arenaofbias-data` 构建馆藏数据包。后端本地目前无 `dist/`，运行前必须将构建好的数据包放入 `DIST_DIR`，不能直接按默认路径启动。

- 本仓库为 Show1×Show2 融合工程的共享后端：唯一动态服务（账号、投票、排行榜、投稿审核、作品沙盒伺服），零 npm 依赖（Node ≥ 22.13 内置模块）。
- 2026-09-27 最初从 same-prompt-gallery 的 platform-fusion 分支拆出；当时的 11 项测试与冒烟记录仅属历史基线，当前验证以上述 19 项和本轮联调为准。

## 待办

- 远端 `https://github.com/kme7kme7-prog/arenaofbias-server.git` 已配置；本轮分支和文档提交均未 push，推送仍待用户授权。
- 生产部署需确定 API 与作品源域名、泛域名解析/证书和反向代理；公网尚未验证。其它功能另行确认，不属于本轮。

## 红线

- 数据库只经 MIGRATIONS 追加迁移，不手改。
- `.data/`、`dist/`、`node_modules/`、日志为生成物，不提交、不手改。
- 不经用户明确同意不 commit、不 push。

## 本轮浏览器联调记录

主 agent 使用画廊 `backend-datapack-integration` 与后端本分支完成上述跨端口联调；隔离测试目录为画廊 `output/backend-integration-data`。联调详情见 `docs/archive/2026-09-28-gallery-integration-wsnxxxs.md` 末尾补充；后续文档更正见 docs-followup 归档。
