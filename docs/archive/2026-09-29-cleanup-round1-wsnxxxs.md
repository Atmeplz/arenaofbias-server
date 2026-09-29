# 2026-09-29 · cleanup-round1 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex Desktop（GPT-6）

## 本轮目标

- 从 `main@6ef99df` 建立本地分支 `cleanup-round1`，完成后台批量分面开关、数据包版本宽容处理、两个 HTTP 编码问题修复，以及接口契约补全；随后 rebase 到 `origin/main@22271ea`。
- 原轮每项完成后运行 `npm run check && npm test`；rebase 后再次完整复验。本分支不合并、不部署。

## 改动

- 上游 `22271ea` 已将 Show1 golden 文件纳入 `test/fixtures/show1-golden/`；rebase 冲突时，`test/show1-guess.test.mjs` 和 `test/show1compat.test.mjs` 完全采用上游版本。
- `server/library.mjs`、`server/app.mjs`、`admin/admin.js`、`admin/admin.css`、`test/admin.test.mjs`：后台作品表可在当前页多选并批量打开或关闭展览馆、竞技场开关。新增管理员接口 `POST /api/admin/works/batch-face-settings`，每批 1–200 件，在一个事务内复用单件 `setFaceSettings`，每件写一条 audit；测试覆盖权限、逐件记录、失败回滚与数量上限。
- `server/app.mjs`、`test/datapack.test.mjs`、`test/platform.test.mjs`：请求携带的 `X-Datapack-Version` 与服务端快照不一致时继续处理，在响应中加入 `X-Datapack-Stale: 1`；可信来源可通过 `Access-Control-Expose-Headers` 读取该头。已检索两端代码：展览馆 `site/platform-api.js` 会发送版本头，`site/platform.js` 仍会在 bootstrap 阶段自行拦截版本不一致的动态功能；Show1 未发现 `datapack_mismatch` 或相关请求头处理。
- `server/http.mjs`、`test/http.test.mjs`：跳过畸形 Cookie；畸形路由参数编码返回 400，并分别补一条测试。
- `docs/api-contract.md`：记录批量接口、版本头和 CORS 暴露头行为，补齐现有 admin inbox、作品 meta/curate 和 `/api/guess/*` 接口，并校正相关默认分面开关描述。
- `HANDOFF.md`：更新为 rebase 后的基线与生产现状。线上 `/api/bootstrap` 的 `serverVersion` 已确认部署版本为 `22271ea`；生产数据库版本和数据包版本未核实。

## 验证

- 原轮五项完成后均运行了 `npm run check && npm test`。rebase 到 `22271ea` 并补 CORS 暴露头后完整复验成功：语法检查 38 文件、0 错误；测试 79 项、79 通过、0 失败、0 跳过。Show1 golden 用例使用仓库内 fixture 正常比对。
- 未运行远端 CI，也未做后台页面的真实浏览器交互或生产环境验证。

## 明确没做

- 未添加 npm 依赖或数据库迁移；未修改盲测池默认值、show1/show2 名称、`/api/v1` 前缀、`curate.mjs`、备份脚本、`capture.mjs`、`datapack-sync.sh`。
- 未合并或部署；未修改生产环境及本地生成物。

## 遗留物

- `cleanup-round1` 已获用户审阅通过，合并和部署由 kme7kme7-prog 决定。`HANDOFF.md` 在建分支前已有上一轮未提交的修改，本轮据此重写为当前状态。
- 生产环境运行共享后端；线上 `/api/bootstrap` 的 `serverVersion=22271ea` 确认当前部署提交。生产数据库与数据包版本未核实。
- 展览馆前端仍有独立的数据包版本门禁。后端取消 409 后，前端在版本不一致时仍可能暂停动态功能。

## 下一步建议

- 审阅后台批量操作界面；部署前核实生产数据库和数据包版本，备份运行数据，并确认展览馆前端版本门禁与上线顺序。
- 由 kme7kme7-prog 决定合并和部署。
