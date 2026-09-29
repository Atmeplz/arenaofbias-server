# 2026-09-29 · fix-round1 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex

## 本轮目标

修复审计指定的鉴权、预览隔离、可靠性、缓存及导出问题；补审两个分享卡 PR。

## 改动

- S-01：公开注册拒绝保留管理员名，复用已占用的 409；CLI 从标准输入创建管理员。
- S-02：`/admin/inbox/` 文件统一设置 `Content-Security-Policy: sandbox allow-scripts` 和 `nosniff`。
- C-03：封面先写临时文件；作品、草稿和审计同事务；提交后原子改名，失败补偿并回退目录；启动将无数据库行的作品目录移入 `orphans/`，完成已提交封面临时文件。
- C-04/C-05/C-06：文件流用 pipeline 处理打开及传输错误；收到关闭信号等待在途 HTTP，10 秒超时退出；JSON 统一限定对象。
- C-01/DP-01：馆藏校准保留当前展示开关，管理员校准及成功接管使排行榜缓存失效。
- DP-06：导出按令牌每分钟 2000 次，IP 每分钟 10000 次兜底；429 提供 `Retry-After`。
- 更新 README、API 契约和 HANDOFF；分享 PR 只读审阅存于 `output/audit/share-review.md`。

## 验证

- `npm run check`：44 文件、0 错；`npm test`：96/96 通过。
- 临时目录内复跑审计基线及修复后 probe：保留名、预览、校准、接管缓存、文件流、投稿故障、关停、JSON 24 路径、121 文件导出。
- Playwright/Chrome 临时浏览器 probe：旧版新窗口预览能读管理员列表；修复后同一 Cookie 下页内 fetch 抛 `TypeError`，直接 API 控制请求仍为 200。
- 与数据仓的子路径和导出探针分别得到 3/3 资源 200、121 文件导出成功。

## 明确没做

未新增迁移、npm 依赖；未部署、合并 PR 或推送 main。未读取生产数据库、日志或密钥。

## 遗留物

临时故障与浏览器探针位于系统临时目录；审计补审报告在忽略的 `output/audit/share-review.md`。生产数据未触及。

## 下一步建议

审阅 PR 后安排上线；先核对保留管理员账号归属与实际部署版本。分享 server PR 的后台邮件需在并入 C-05 前处理 SH-01。
