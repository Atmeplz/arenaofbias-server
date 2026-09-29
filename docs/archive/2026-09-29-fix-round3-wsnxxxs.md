# 2026-09-29 · fix-round3 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex

## 本轮目标

完成 S-03、C-02、R09，核对 DP-08，并更新接口和部署文档。

## 改动

安全会话改用 Secure 环境下的 Host 前缀 Cookie 并拒绝重名；配对按配置对先抽样，scrypt 异步执行；冷榜单求解移到 worker。猜模型结果去重并限流，数据库追加 v15 迁移。补 Show1 契约、部署流程及差异包工具。

## 验证

审计 probe 以 1000 投稿、10000 票和 1000 模型配置在本地隔离库复跑；结果见仅本地保存的 `output/audit/round3.md`。`npm run check`：53 文件、0 错；`npm test`：112/112 通过。

## 明确没做

未部署、未合并 PR、未推送 main。未修改用户作品独立域名的线上配置；Turnstile 尚未配置。

## 遗留物

本地 `output/audit/` 为探针和报告，不入库。

## 下一步建议

审阅 PR 后按 `docs/deploy.md` 备份和部署；上线时通知用户 Cookie 改名导致一次性登出。为作品配置独立可注册主域。
