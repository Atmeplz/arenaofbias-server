# 2026-09-28 · 接入独立画廊 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 Sol（后端子 agent）

## 本轮目标

支持 same-prompt-gallery 最新平台前端独立部署，补齐其现有 API 行为，保持 arenaofbias-server 为唯一动态服务。

## 改动

- 将当前画廊已有的社区题目、昵称与个人活跃统计、Vite 投稿实现及现有测试移入独立后端。题目表和昵称字段以追加迁移方式保留旧账号与运行记录。
- `POST /api/questions`，`bootstrap.questions`，`GET /api/me` 的本人题目/活跃热图/收到表情，`PATCH /api/me` 与画廊现有响应保持一致。
- `SITE_ORIGINS` 提供完整 origin 精确匹配的凭据 CORS、API 写请求许可与内容嵌入许可；API 支持 OPTIONS 与 Content-Type 预检，可信来源的错误响应也携带 CORS 头。
- 新增 `COOKIE_SAME_SITE=Lax|Strict|None`，None 必须同时启用 Secure；登录与登出保持相同策略。投稿媒体继续返回 `media/...`，前端按后端站点根解析，内容与对战地址继续返回完整令牌子域 URL。
- README、API 契约与 HANDOFF 同步；工作分支 `gallery-integration`。

## 验证

- `npm test`：19/19 通过（沿用当前画廊17项平台测试，另加跨 origin 预检/登录/读取会话/拒绝外部写入，以及 None + Secure Cookie 回归）。测试只写独立临时目录，不使用任何原画廊运行数据。
- `server/*.mjs` 的 Node 语法检查通过；`git diff --check` 通过。
- 测试包含发布题目持久化、Vite 构建目录试加载、投稿/审核/盲投/排行榜、昵称不更改登录名与个人统计。
- 最终前后端联调及页面目检由主 agent 验收后补充，当前不表述为全部交互已验证。

## 明确没做

- 未 push、未部署到公网；本次修改尚由主 agent 统一提交。
- 未迁入旧生产账号、作品或投票；未实现评论、猜模型、分榜或其它新玩法。
- 未改写已发布的数据库迁移，未引入 npm 依赖，未写原画廊 `.data/` 或 `.claude/`。

## 遗留物

- 本仓库现有 `dist/` 数据包仍为本地生成物；最终联调可通过 DIST_DIR 指向数据仓库构建产物。

## 下一步建议

- 以实际前端 origin 配置 SITE_ORIGINS，并通过两个独立端口联调；生产域名与可信反向代理仍需按最终部署设置确认。跨站 Cookie 受浏览器设置影响，优先同站域名部署。

## 补充验收（2026-09-28）

主agent完成localhost:4175前端接5190 API / 5191作品源联调：浏览器登录并刷新保留会话、昵称PATCH、创建题目、HTML上传/沙盒交互/投稿、活跃统计、审核存疑、真实Boeing馆藏盲评投票揭晓与榜单更新均通过。桌面及390px题库目检通过，正常联调console未见错误。关闭后端后静态前端恢复5题83份。测试数据位于画廊output/backend-integration-data；旧.data未触碰，本轮服务已停止。未验证公网HTTPS/跨站Cookie策略/真机/自动截图/全部原作交互。前端分支backend-datapack-integration，配套使用，未push。
