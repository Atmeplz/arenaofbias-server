# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/archive/` 归档，工作约定见 `AGENTS.md`。

## 当前轮：后台管理完善 A/B（2026-09-28，未提交）

- v9 已追加：`works` 双门面开关与竞技场校准，从 v8 `audience` 回填；`work_overrides` 为精选作品保存开关及双取景；`task_editorial` 保存分门面点评与权重。`audience` 保留并随新管理写入同步。
- 管理 API 已提供作品合并筛选/分页、双门面设置/校准、题目主编视角、流量汇总与管理员 HTML/ZIP 代传；管理写入留 audit。竞技场配对和 B–T 计分按 `show_arena` 过滤，仍只计 `votes.source='arena'`。Show1 `/api/prompts` 在有 arena 编辑覆盖时合并点评与权重，默认快照响应不变。
- `admin/` 现有零依赖 SPA 加入展览馆/竞技场视图切换、合并作品表、题目编辑、流量页，以及审核双开关/元数据编辑和代传入口。浏览器已核验切换、题目权重保存、取景与代传表单、流量页及窄屏顶栏；没有做全量人工逐行操作。
- `npm test` 69/69（含验收方补的 votes 权重透传回归），`npm run check` 33 文件零错误。验收方补修：Show1 /api/votes 的 promptWeights 现随 task_editorial 覆盖实时生效（雷达回放跟随当前权重，与旧站一致）。已提交。
- C 期仍未做：Show1 兼容快照动态扩池、七道题进入数据仓库、画廊静态前端消费精选覆盖和题目策展覆盖。当前后台覆盖层已可写读，正式画廊页面的精选陈列仍按数据包正本渲染。

## 当前状态（2026-09-28，Show1 接入能力开发中）

- 本仓库为 Show1×Show2 融合工程的共享后端：唯一动态服务（账号、投票、排行榜、投稿审核、作品沙盒伺服），零 npm 依赖（Node ≥ 22.13 内置模块）。`same-prompt-gallery` 提供静态画廊前端；`arenaofbias-data` 构建馆藏数据包；本仓库提供唯一动态 API、数据库和投稿作品沙盒。
- main 与 gallery-integration 自 bbaf0d7 分叉后汇合：管理端（见下节）与画廊集成/版本化对局/快照计分全部保留。原迁移不变；本轮在 `MIGRATIONS` 末尾追加 v6（`users.hash_params`、`comments` 表及可见评论索引）。
- Show1 接入能力：迁入用户凭 `hash_params` 用旧 scrypt 参数验证，首次成功登录后自动更新 salt/hash 并清空参数；已上架作品可公开读评论、登录发布、本人/管理员软删除；投稿作者/管理员可把 Show1 的 `framing` 与 `camera` 分别写入 `trial.calibration`，投稿公开视图仅增加 `calibration`。Show2 馆藏仍使用数据包和画廊原有展示方式。端点与限制见 `docs/api-contract.md` 3.15–3.16。
- 本轮验证：`npm test` 29/29 与 `npm run check` 通过，覆盖 v5→v6、旧密码升级、评论、校准、迁移 dry-run/apply 幂等及隐藏审核；尚未做两个前端的真实页面联调。代码与文档尚未 commit/push。
- Show1 历史迁移（本轮追加）：schema v7 新增 `works.audience`（`hidden/show1/show2/both`；既有作品默认 `show2`）。迁入作品设为 `unverified+hidden`，管理员在审核时指定站点；Show2 bootstrap 与盲评池隔离 Show1 作品，`GET /api/show1/works` 只读已批准的 Show1 作品。`scripts/migrate-show1.mjs` 支持只读源库、dry-run、逐表报告、JSON 映射 artifact、幂等 apply；用本地开发库在临时目标库验证过 dry-run、apply、重复 apply。正式备份未提供，尚未对生产库执行。
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
- Show1 正式备份（预期 24 用户 / 264 作品 / 56 反应）与作品目录待提供并先 dry-run；当前 Show1 本地 `data/comments.db` 只有 2 用户 / 233 作品，不能代替正式备份。旧票和旧评论按用户决定不迁。七道 Show1 专有题目仍需由数据仓库补正式定义；两件旧 React 模板需补独立文件后才能审核发布。
- 后续补 Show1 特色端点：猜模型（模一把）、分享卡。
- votes 表按计划加 `source` 列（娱乐面/正式盲评/历史迁移）；users 表待加 `email`/`email_verified_at` 两列。
- 生产部署需确定 API 与作品源域名（泛域名 `*.w.arenaofbias.icu`）、证书与反向代理；公网尚未验证，列为早期验证项。

## 红线

- 数据库只经 MIGRATIONS 追加迁移，不手改。
- `.data/`、`dist/`、`.datapack/`、`node_modules/`、日志为生成物，不提交、不手改。
- 不经用户明确同意不 commit、不 push。

## 本轮浏览器联调记录（画廊集成时）

主 agent 使用画廊 `backend-datapack-integration` 与后端 gallery-integration 分支完成跨端口联调（登录与刷新、题目发布、昵称、HTML 投稿/沙盒交互、审核、盲评、榜单与个人统计）；隔离测试目录为画廊 `output/backend-integration-data`。联调详情见 `docs/archive/2026-09-28-gallery-integration-wsnxxxs.md` 末尾补充；后续文档更正见 docs-followup 归档。
