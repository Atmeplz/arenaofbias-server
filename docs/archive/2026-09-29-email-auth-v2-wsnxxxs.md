# 2026-09-29 · email-auth-v2 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex
- 起点：`origin/main@6872c8d`；分支：`email-auth-v2`

## 本轮目标

恢复共享后端的可选邮箱绑定、验证码找回密码及 Turnstile，供 Show1 前端接入，不部署或合并。

## 改动

- 在 `MIGRATIONS` 末尾追加幂等迁移；用户邮箱可空、唯一且写入时转小写，验证码只存哈希、用途、有效期、尝试次数与冷却时间。
- 移植零 npm 依赖 SMTP/Turnstile；增加发码、预校验、绑定/换绑、重置接口，登录及 `/api/auth/me` 返回真实邮箱。重置删除该用户全部会话，发码响应不透露账号是否存在。
- README 和 API 契约补充环境变量、请求形状和部署顺序。分享卡保持原状。

## 验证

- `npm run check`：语法通过。
- `npm test`：89/89 通过；新增 8 项覆盖迁移幂等、假 SMTP 发信、过期、错码上限、邮箱/IP 限流、换绑、重置后会话失效、Turnstile 两种状态。
- 本地与 Show1 前端经 Vite 代理联调：无邮箱注册、假 SMTP 发码绑定、忘记密码重置及新密码登录通过。

## 明确没做

- 未部署、未合并、未修改生产数据；分享卡不在范围内。

## 遗留物

- 无仓库内未提交的业务文件；本地联调临时数据库在系统 TEMP 中，自动审查拒绝删除操作，需人工清理。

## 下一步建议

- 审阅并先部署 server PR，配置 `SMTP_HOST/PORT/USER/PASS`，按需配置 `SMTP_FROM/FROM_NAME`；生产开启 Turnstile 时配置 `TURNSTILE_SITE_KEY/SECRET_KEY`。再部署 Show1 PR。
