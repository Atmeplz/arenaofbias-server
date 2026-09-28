# 2026-09-28 · 画廊接入文档跟进 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 Sol（后端子 agent）

## 本轮目标

功能提交之后更正后端交接、运行说明和 API 契约中的旧状态，区分代码默认值、本机联调配置与尚未验证的生产部署。

## 改动

- 后端功能已在本地 `gallery-integration` 提交 `51eb3cb`（`Support the gallery frontend and trusted origins`）；配套前端功能提交为 `1ee5dae`（`backend-datapack-integration`）。两个分支均未获 push 授权。本次文档改动由主 agent 统一提交。
- 明确三仓库归属：`same-prompt-gallery` 托管静态画廊前端与馆藏展示；`arenaofbias-server` 托管唯一动态 API、数据库与投稿沙盒；`arenaofbias-data` 构建后端读取的数据包。
- 本后端仓库当前没有 `dist/`。启动前需将已构建数据包交给 `DIST_DIR`；README 给出本机联调 PowerShell 配置示例，API 契约列出联调 4175/5190/5191 与代码默认 5173/5180 的区别。
- 更正 `HANDOFF.md` 中“远端待创建”“待统一提交”“本机 dist 已存在”及历史测试数量的过时表述；旧画廊接入归档仅作为原始阶段记录保留正文，此记录作为后续更正。

## 验证

- 功能提交前 `npm test` 19/19、Node 语法检查与 `git diff --check` 已通过；本次仅修改文档，未重跑后端测试。
- 主 agent 已用隔离测试数据在本机完成真实浏览器跨端口联调：登录/刷新保留会话、题目发布、昵称、HTML 上传与投稿沙盒、审核、盲评揭晓与榜单、个人统计。前端为 `localhost:4175`，API 为 `localhost:5190`，作品源为 `*.localhost:5191`；桌面和 390px 题库已目检。测试数据在画廊 `output/backend-integration-data`，旧 `.data/` 未改，联调服务已停止。
- 本次文档改动的 `git diff --check` 通过；新增归档检查无行尾空白。

## 明确没做

- 未 push、未部署公网；公网 HTTPS、跨站 Cookie 策略、真机、自动截图和全部原作交互均未验证。
- 未增改 API 实现、数据库迁移或数据包内容；未重新运行功能测试，因为只有文档变化。

## 遗留物

- 后端本地无 `dist/`。实际运行时必须提供数据包路径，并与画廊静态部署所用馆藏版本同步。

## 下一步建议

- 部署前确定 API 与作品源域名、反向代理、泛域名解析/证书及可信站点 origin，再做 HTTPS 实测。文档提交及是否推送按用户授权由主 agent 处理。
