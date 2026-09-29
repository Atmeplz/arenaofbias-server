# 2026-09-29 · curate-v2 审阅修订 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex

## 本轮目标

修复 PR #2 审阅指出的事务嵌套、逐文件导出开销及接管时门面开关丢失。

## 改动

- catalog 刷新只排队接管；`setImmediate` 在当前同步事务结束后执行。成功 revision 记入集合，失败写日志，下一次 refresh 可重试。
- 单文件导出仅验证相对路径并通过 `resolveInside` 定位文件，不再反复计算整件作品的 SHA-256；元数据请求仍生成完整文件清单及哈希。
- 接管前读取投稿的 `show_gallery` 与 `show_arena`，在同一事务中插入馆藏 `work_overrides`；已存在的 override 不覆盖。回归用例在管理员批量设置事务内触发数据包切换，确认请求成功、接管完成，且两个开关正确继承或保留。

## 验证

- `npm run check`：38 文件，0 错误。
- `npm test`：81 项通过，0 失败。

## 明确没做

- 未合并 PR，未部署，未推送 main。

## 遗留物

- 无未提交的演练文件；PR #2 仍依赖 server PR #1。

## 下一步建议

- 先审阅并合并 server PR #1，再审阅本 PR 的修订提交。
