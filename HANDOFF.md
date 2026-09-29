# HANDOFF.md · 当前状态

## 2026-09-29 · fix-round1（待 PR 审阅，未部署）

- 从 `origin/main@9c32bb9` 建立。修复审计 S-01、S-02、C-01、C-03、C-04、C-05、C-06、DP-01、DP-06 服务端部分；无 npm 依赖、无数据库迁移、未改动已有数据。
- 保留管理员名公开注册统一 409；新增 `npm run admin -- --create <用户名>`，密码从标准输入读取。收件箱预览加 CSP sandbox 和 nosniff；投稿封面先暂存，作品与审计同事务，启动隔离孤立目录；静态文件流处理错误；关停最多等待 10 秒；JSON 只收对象；校准和自动接管失效排行榜；导出按令牌每分钟 2000 次，IP 兜底 10000 次。
- 审计基线与修复后探针、真实浏览器预览验证完成；`npm run check && npm test`：44 文件语法检查、96/96 测试通过。分享卡 PR #4 只读补审见 `output/audit/share-review.md`。本轮未部署、未合并。
- 生产仍运行 `origin/main@9c32bb9`。上线前确认生产 `ADMIN_USERNAMES` 对应账号由可信人员持有；本轮没有迁移。先审阅本 PR 与数据仓 `curate-v2` PR，再决定部署顺序；server `share-v2` 的后台 SMTP 与关停语义交叉见 SH-01。

## 2026-09-29 · email-auth-v2（待 PR 审阅，未部署）

- 本分支从 `origin/main@6872c8d` 建立。追加 v13 幂等迁移：用户可空邮箱与验证时间、大小写不敏感唯一索引、只存哈希的验证码表；没有改写存量迁移或数据。
- 恢复零依赖 SMTP 和 Turnstile；注册只需账号密码，启用 Turnstile 时注册提交与邮箱发码均校验 token。登录后可绑定/换绑邮箱；绑定邮箱可重置密码并清除该用户全部会话。重置发码响应统一，不透露账号/邮箱状态。Show1 旧分享卡 501 保持不变。
- 验证：`npm run check` 通过；`npm test` 最终数量见本轮归档；本地 Show1 Vite 代理 + 共享后端 + 假 SMTP 完成注册、绑定、找回、重新登录联调。部署前配置 `SMTP_*`，生产开启 Turnstile 时再配置两把 `TURNSTILE_*`；先部署本 PR，再部署 Show1 PR。未部署、未合并。


## 2026-09-29 · curate-v2 审阅修订

- 在 `curate-v2` 追加修订：catalog 切换后的接管通过 `setImmediate` 执行，成功 revision 只处理一次，失败记日志并在下次 refresh 重试，避免请求内事务嵌套；导出单文件不再重算全量文件哈希；接管时继承投稿的展览馆与竞技场开关，已有馆藏 override 保持原样。
- 验证：`npm run check` 38 文件 0 错；`npm test` 81/81 通过。新增回归覆盖在批量设置事务中切换数据包、异步接管和开关继承。详见 `docs/archive/2026-09-29-curate-v2-review-wsnxxxs.md`。

## 2026-09-29 · curate-v2

- 本分支从 `origin/cleanup-round1` 建立，依赖尚未合并的 PR #1。共享生产后端仍为 `22271ea`；本轮不部署。数据仓库配套分支为 `curate-v2`。
- 移除请求内 Git 收录，改为管理员提名与可撤回的 14 天导出令牌。数据库迁移 v12 只增加四个可空字段；旧的 `curated_as` 保留。数据包结果带 `sourceUpload` 时，catalog 版本变化触发一次幂等接管。
- 远端 `git ls-remote origin "refs/heads/intake/*"` 返回空，未发现旧按钮推送的远端 intake 分支。
- 验证：`npm run check` 38 文件 0 错；`npm test` 80/80 通过。本地跨仓演练从投稿、审核、提名、收录、构建到自动接管成功；演练 intake 分支及临时数据库已删除。详见 `docs/archive/2026-09-29-curate-v2-wsnxxxs.md`。

> 接手先读 `AGENTS.md`；接口与运行方式见 `README.md`、`docs/api-contract.md`，轮次过程见 `docs/archive/`。

## 当前基线（2026-09-29）

- 当前工作分支 `cleanup-round1` 已 rebase 到 `origin/main@22271ea`；本轮改动已获用户审阅通过，合并和部署由 kme7kme7-prog 决定。main 基线包含 `9bd44a5` 分面审核、`94e7d89` 公共后台、`75ba480` 馆藏参与分面审核、`2fffe04` 迁移 v10、`6ef99df` 迁移 v11，以及 `22271ea` 将 Show1 golden 文件纳入仓库。
- **共享后端已经在生产环境运行，当前部署版本为 `22271ea`，已通过线上 `/api/bootstrap` 的 `serverVersion` 确认。** `arenaofbias.icu/api` 和 `api.arenaofbias.icu` 由本服务提供。生产数据库迁移版本和数据包版本尚未核实。
- 本服务是 Show1 与 Show2 的唯一动态 API 和数据库写入者，零 npm 依赖（Node ≥ 22.13）。本轮未新增数据库迁移；当前代码的迁移序列到 v11。馆藏数据包本地 pin 为产物提交 `92f8ab99e3ca7835521a439b850d36dff2858878`，`.datapack/current` 已指向该版本；这不代表生产数据包状态。

## 本轮改动

- Show1 golden 文件由上游 `22271ea` 纳入 `test/fixtures/show1-golden/`；两个相关测试文件采用上游版本，照常比对仓库内 fixture。
- 后台作品表支持本页多选，并在当前展览馆或竞技场视图批量开关。新增管理员 API，每批 1–200 件，复用单件设置逻辑；整批同一事务，逐件写 `face-settings` audit，失败回滚。
- 馆藏版本请求头不一致时继续处理请求，响应增加 `X-Datapack-Stale: 1`；可信来源通过 CORS 的 `Access-Control-Expose-Headers` 可读取该提示；对局仍绑定服务端快照。画廊前端仍会在 bootstrap 阶段独立检查数据包版本并暂停不匹配的动态功能；Show1 未查到该错误码或请求头处理。
- 畸形 Cookie 被跳过；畸形路由参数编码返回 400。`docs/api-contract.md` 已补管理员收件箱、meta、curate、猜模型接口，并按代码修正相关默认开关描述。

## 验证与待确认

- 原轮每项完成后均运行 `npm run check && npm test`；rebase 到 `22271ea` 并补 CORS 暴露头后完整复验通过：语法检查 38 文件、0 错误；测试 79 项、79 通过、0 失败、0 跳过。Show1 golden 用例已使用仓库内 fixture 正常比对。
- 未做后台页面的真实浏览器交互验收，也未在生产环境运行本分支。部署前先确认生产数据库版本和数据包版本，备份运行数据，再核对画廊独立版本门禁对上线顺序的影响。
- 数据库结构只允许在 `server/db.mjs` 的 `MIGRATIONS` 末尾追加幂等迁移。`.data/`、`dist/`、`.datapack/`、`node_modules/` 和日志为本地数据或生成物，不入库、不手改。
