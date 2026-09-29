# HANDOFF.md · 当前状态

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
