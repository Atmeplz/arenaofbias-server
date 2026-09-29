# 2026-09-29 · 提名收录后端 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex

## 本轮目标

把同步 Git 收录改为提名、只读导出、发布后自动接管，并与数据仓库完成本地演练。

## 改动

- 从 `origin/cleanup-round1` 建立 `curate-v2`。新增幂等 v12 迁移，添加提名时间、提名人、导出令牌哈希及过期时间四列；保留 v11 `curated_as`。提名与撤回写审计，重复提名换发令牌。
- 导出接口凭令牌提供元数据与 SHA-256 文件清单，文件路径经 `resolveInside` 校验并限流。后台显示提名状态、撤回按钮和可复制命令。删除服务端 Git 流程与 `CURATE_REPO_DIR`。
- catalog 版本变化时用 `sourceUpload` 自动接管原投稿，条件更新避免重复审计。更新接口文档及测试。
- 动手前执行 `git -C arenaofbias-data ls-remote origin "refs/heads/intake/*"`，结果为空：未发现远端 intake 分支。

## 验证

- `npm run check`：38 文件，0 错误。
- `npm test`：80 项通过，0 失败。
- 本地演练：临时 `DATA_DIR` 注册 root 与 alice，alice 投稿 HTML，root 审核及提名；data 命令生成完整馆藏后，`build:data` 产出带 `sourceUpload` 的结果，后端自动设置 `curated_as=chinese-architecture/grok-4-6-high`，原投稿从公开列表退场。演练分支及临时数据已删除。

## 明确没做

- 未合并 PR，未部署，未推送 main；生产数据库版本及数据包版本未核实。

## 遗留物

- 无演练临时数据或 intake 分支。生产上线仍需等待数据包发布及两站消费端版本核对。

## 下一步建议

- 先合并依赖 PR #1，再审查本分支；部署前按既有流程备份生产数据并检查数据包版本。
