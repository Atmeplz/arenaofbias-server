# 2026-09-28 · 版本固定与投票身份快照 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：GPT-6 Sol high 子 agent，主 agent 审查集成

## 本轮目标

落实对局固定版本、多请求一致性、历史计分归属快照，以及显式更正和安全的版本生命周期。

## 改动

随本轮英文提交：catalog 根据真实目录与发布标识加载；matches 保存真实目录、版本和双方身份，votes 保存原始模型/档位/计分 key。追加迁移到 v5；更正写独立列和审计，legacy 不伪造历史身份。bootstrap 版本握手与请求失配防护；按 pin 下载、激活、清理工具和纠错 CLI；PR CI。

## 验证

- npm run check：25 脚本通过；npm test：23 项通过；git diff --check 通过。
- 同 mtime 的 A/B 切换、令牌 HTML/资源跨切换与重启、身份快照不漂移、原始快照保留、旧库迁移、审核剔除和清理宽限期通过。
- 用真实旧固定数据包与新本地 schema 包分别完成前端 HTTP smoke：bootstrap、认证/me、题目、草稿/投稿媒体、馆藏对局 HTML 与资源、投票和失配 409。
- Windows 本机新建 current junction 与同版本激活通过；不同目标的 Windows 原子替换未验证，代码失败时保留旧链接；Linux 真实发布切换未执行。

## 明确没做

未 push/部署、未改生产库、未跑生产清理。公网 HTTPS、第三方 Cookie、真机、全部原作和自动截图未验。

## 遗留物

.datapack 保存实际 pin 和 current 链接；output/release-review-data 为独立测试数据库和文件，不迁入 .data。旧 votes 的 legacy 语义保留，不假称已有当时快照。

## 下一步建议

先将本提交推至远端再运行前端固定配套 SHA 的 CI；部署以同站 HTTPS 为优先，作品使用独立注册域。清理与版本切换串行，宽限期覆盖实际请求超时。
