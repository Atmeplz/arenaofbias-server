# API 契约 · arenaofbias-server

> 本文档是「娱乐面 React 站」与「专业面静态画廊」两个前端对接本后端的**唯一硬接口文档**。
> 文中全部端点、字段、状态码与限制均以 `server/` 目录当前代码为准逐条核实；
> 与代码现状存在出入、或尚待双方确认之处，均以「**待拍板**」标出。
>
> 核实基准：`server/app.mjs`（路由表）、`auth.mjs`、`library.mjs`、`arena.mjs`、`catalog.mjs`、`ranking.mjs`、`config.mjs`、`http.mjs`、`content.mjs`、`db.mjs`。

---

## 1. 总述

### 1.1 服务定位

本服务是整个体系中**唯一的动态服务与唯一写库者**，负责账号、投票、排行榜、投稿审核与作品沙盒伺服。两个前端均为静态部署，除本服务外不存在其他后端；数据库（`DATA_DIR/platform.db`）由本服务独占，前端不直接读写。

服务同时监听**两个端口**：

| 端口 | 默认 | 职责 |
| --- | --- | --- |
| 站点 / API 端口 | 5173 | 全部 `/api/*` 接口、`/media/*` 投稿媒体、dist 静态文件 |
| 作品内容端口 | 5180 | 按令牌子域伺服单个作品目录（沙盒隔离，见 3.10） |

### 1.2 Base URL

| 环境 | Base URL |
| --- | --- |
| 本地开发 | `http://localhost:5173`（API 与媒体）；作品内容为 `http://{token}.localhost:5180` |
| 生产环境 | **待拍板（占位）**：API 站点域与作品内容域需为**两个不同的可注册域**（作品域需泛域名，形如 `*.w.example.com`），以域名隔离作为作品沙盒的根基。生产域名尚未在公网验证，列为早期验证项 |

作品内容 URL 不写在各端点文档里逐个列出，而是由响应字段（`bootstrap.site.content`、作品对象的 `scene`、对战对象的 `a`/`b`）以完整 URL 形式下发，前端直接消费，不自行拼接。

### 1.3 认证方式

- 认证基于 **Cookie 会话**。注册 / 登录成功后，响应头种下：
  `Set-Cookie: sp_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`（30 天；`COOKIE_SECURE=1` 时追加 `Secure`）。
- Cookie 名为 `sp_session`，HttpOnly，前端脚本不可读；服务端只存其 SHA-256。
- 前端请求需携带 Cookie（`fetch` 使用 `credentials: 'same-origin'`；跨域部署时见 1.5 的待拍板项）。
- 登出（`POST /api/auth/logout`）删除服务端会话并下发 `Max-Age=0` 的清空 Cookie。
- 角色：`member`（默认）与 `admin`。用户名被列入服务端 `ADMIN_USERNAMES` 环境变量的账号在注册 / 登录时自动持有 `admin` 角色；运营亦可经 `npm run admin -- <用户名>` 提升。

### 1.4 通用错误格式

所有错误响应均为 JSON，形状如下（`server/http.mjs` 的 `HttpError`）：

```json
{ "error": "人类可读的中文错误信息", "code": "可选的机器可读代码" }
```

- `error` 恒存在，面向最终用户，可直接展示。
- `code` 仅在少数业务错误上出现，目前仅有两个取值，均出自创建对战：`"insufficient"`（对战池不足）与 `"exhausted"`（该用户已评完全部组合）。前端逻辑判断请用 `code`，不要匹配 `error` 文案。
- HTTP 状态码全集：`400`（参数无效）、`401`（未登录 / 凭证错误）、`403`（无权限 / 来源无效）、`404`（不存在）、`405`（方法不允许）、`409`（状态冲突）、`413`（体积超限）、`415`（Content-Type 非 JSON）、`429`（限流 / 待审超限）、`500`（服务端错误，固定文案「服务器出错了，请稍后再试」）。
- 非 GET/HEAD 的 `/api/*` 请求必须带有与站点同源的 `Origin` 头（`assertSameOrigin`，Origin 的 host 须与请求 Host 一致），否则一律 `403 请求来源无效`。浏览器跨域 fetch 天然带 Origin，因此跨站前端在当前代码下**所有写操作都会 403**（见 1.5 待拍板）。
- JSON 请求体默认上限 64 KB；`POST /api/works` 单独放宽至 6 MB（封面以 data URL 内嵌所致）。

### 1.5 跨域约定（CORS）

- **现状：服务端不下发任何 `Access-Control-Allow-*` 头**。两个前端若与本服务同域（或经反向代理同域）部署，无任何问题；不同域部署时浏览器会拦截全部响应。
- 同源校验（1.4）与 CORS 是两道独立防线：即便将来放开 CORS，`Origin` 校验仍决定写操作是否被接受。
- **计划（待拍板）**：仅对公开 GET 端点（`/api/bootstrap`、`/api/leaderboard`、数据包静态文件等）开放跨域读取；写端点是否放行跨域、以及随之需要的 `SameSite=None; Secure` Cookie 改造，需双方另行拍板。

### 1.6 限流一览

限流为固定窗口计数（`http.mjs` 的 `rateLimit`），命中返回 `429`，错误文案因桶而异：

| 桶 | 额度 | 计数键 | 作用于 |
| --- | --- | --- | --- |
| auth | 10 次 / 分钟 | 客户端 IP | 注册、登录 |
| write | 120 次 / 分钟 | 用户 ID（未登录时为 IP） | 投稿提交、投票、表情 |
| drafts | 12 次 / 10 分钟 | 用户 ID | 上传草稿 |
| matches | 60 次 / 分钟 | 用户 ID（未登录时为 IP） | 创建对战 |

`TRUST_PROXY=1` 时 IP 取 `X-Forwarded-For` 首段。限流为单机内存计数，进程重启即清零，多实例部署不共享。

---

## 2. 数据模型

以下字段定义以 `server/db.mjs`（表结构）与 `server/catalog.mjs`（馆藏读取）为准。HTTP 层暴露的是经 `library.toPublic` 整形后的「公开视图」，二者分列。

### 2.1 作品（work）

作品分两类：**馆藏作品**（curated，随数据包 `dist/data.json` 分发，平台视为已验证）与**投稿作品**（upload，写入数据库，走审核流）。

**投稿作品（数据库行，时间均为毫秒整数）：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | `up-` + 8 位小写字母数字（如 `up-3f9k2m1x`） |
| `taskId` | string | 所属题目 ID |
| `ownerId` / `ownerName` | string / null | 作者；作者账号删除后为 null |
| `title` / `summary` / `note` | string | 标题（≤40 字）/ 简介（≤200 字）/ 备注（≤1000 字） |
| `modelId` / `modelName` / `vendor` | string / null | 模型归属；`modelId` 命中数据包模型表时名称与厂商取自模型表 |
| `effort` | string | 强度档位，大小写不敏感地归入 `Low / Medium / High / XHigh / Max`；未知值原样保留 |
| `tool` | string | 生成工具（≤40 字） |
| `status` | `unverified` \| `verified` \| `questioned` | 审核状态，默认 `unverified` |
| `reason` | string | 审核理由；`verified` 时恒为空串 |
| `reviewerName` / `reviewedAt` | string / null | 审核人与审核时间 |
| `contentKey` | string | 作品永久内容令牌（`w` + 32 位十六进制），作品 origin 的子域名 |
| `checks` / `trial` | object | 上传检查报告 / 试加载探针数据（仅作者与管理员可见） |
| `captures` | object | 截图映射 `{条件id: 文件名}`，由自动截图写回 |
| `cover` | string / null | 封面文件名（`cover.png` / `cover.jpg` / `cover.webp`） |
| `files` / `bytes` / `digest` | number / number / string | 文件数、解压后字节数、全包 SHA-256 |
| `createdAt` / `reviewedAt` | number / null | 时间戳（公开视图中转为 ISO 字符串） |

**HTTP 公开视图（`toPublic`）：**

投稿作品：

```json
{
  "task": "chinese-architecture",
  "id": "up-3f9k2m1x",
  "curated": false,
  "title": "体素小城", "summary": "……", "note": "……",
  "model": "grok-4.6", "modelName": "Grok 4.6", "vendor": "xAI",
  "effort": "High", "tool": "CLI",
  "status": "verified", "reason": "",
  "owner": "alice", "mine": false,
  "addedAt": "2026-09-27T08:00:00.000Z", "reviewedAt": null,
  "scene": "http://w<32hex>.localhost:5180/",
  "captures": { "first": "media/up-3f9k2m1x/first.jpg", "mobile": "media/up-3f9k2m1x/mobile.jpg" },
  "cover": "media/up-3f9k2m1x/cover.webp",
  "files": 12, "bytes": 183411
}
```

- `scene` 为完整 origin URL（末尾带 `/`），iframe 直接加载。
- `captures` / `cover` 为相对 API 站点的路径（前端拼 base URL）；无封面时 `cover` 为 `null`。
- **特权字段**（仅作者本人或管理员可见，普通访客与匿名者不返回）：`checks`、`trial`、`sourceName`、`root`、`entry`、`reviewer`。

馆藏作品（公开视图字段更少，注意**没有 `scene`**，见 2.7 待拍板）：

```json
{ "task": "…", "id": "grok-4.6", "curated": true, "title": "…", "model": "…",
  "modelName": "…", "vendor": "…", "effort": "…", "tool": "…", "cover": "…", "status": "verified" }
```

### 2.2 任务 / 题目（task）

题目由数据包定义，不落库。字段见第 4 节。平台层关心的两个派生属性：

- `id` / `title`：标识与标题。
- `acceptsUploads`：`promptPending` 为真时置假——提示词原文尚未公开的题目**不接受上传**（`POST /api/drafts` 返回 `409`）。

### 2.3 模型（model）

由数据包 `models` 数组定义：`{ id, name, vendor, logo, brandUrl, brandName }`。投稿时若给出 `modelId` 且命中模型表，服务端以表内 `name` / `vendor` 为准；否则按作者自填的 `modelName`（≤60 字）与 `vendor`（≤40 字）记录，`modelId` 置 null（排行键退化为 `x:<小写模型名>`）。

### 2.4 用户（user）

数据库字段：`id`（16 位十六进制）、`name`（显示名）、`name_key`（NFKC + trim + 小写的唯一键）、`role`（`member` / `admin`）、`salt` / `hash`（scrypt N=16384, r=8, p=1）、`created_at`。

HTTP 公开视图恒为：

```json
{ "id": "…", "name": "…", "role": "member" }
```

未登录时用户字段为 `null`。用户名规则：NFKC 规范化后 2–24 位文字（Unicode 字母）、数字、下划线或连字符；密码 8–128 位。

### 2.5 对局（match）

数据库字段：`id`（24 位十六进制）、`user_id`（可空，匿名对局）、`task_id`、`a_work` / `b_work`（两侧作品 ID）、`a_token` / `b_token`（两侧内容令牌，`m` + 32 位十六进制，唯一）、`created_at`、`expires_at`（3 小时）、`choice`（`a` / `b` / `tie` / `skip`，未投为 null）、`decided_at`。

对局**从不**经列表端点暴露；只在创建与投票两个端点的响应中出现（见 3.8、3.9）。内容令牌在对局有效期内经内容端口伺服对应作品，令牌本身不泄露作品身份。

### 2.6 投票（vote）

数据库字段：`id`、`match_id`（唯一）、`user_id`、`task_id`、`a_work` / `b_work`、`pair_key`（`题目:作品A+作品B`，ID 排序后拼接）、`choice`（`a` / `b` / `tie`，`skip` 不产生投票行）、`created_at`。约束：`UNIQUE(user_id, pair_key)`——**同一用户对同一作品组合只计一票**。

计入排行的投票需同时满足：投票时已登录、双方作品当前均为 `verified` 且存在、非本人作品、未评过该组合。作品被标记存疑或删除后，其相关投票即时退出排行；恢复后重新计入（见 3.9）。

### 2.7 审核状态流转

```
unverified ──审核──▶ verified ──审核──▶ questioned
    ▲                   │                    │
    └────── 审核退回 ────┴────── 审核退回 ◀───┘
```

- `unverified`：初始状态，**不进入**盲投对战池，不进入排行；在作品列表中可见。
- `verified`：进入对战池与排行。
- `questioned`：存疑。必须填写理由（作者与访客均可见）；退出对战池与排行，且**不可再互动**（表情返回 `409`）。
- 删除为软删除（`deleted_at`），馆藏作品不可经 API 删除（`409`，须在数据仓库移除）。

---

## 3. 端点

约定：除注明外，请求体均为 JSON（`Content-Type: application/json`），响应均为 JSON 且 `Cache-Control: no-store`。GET 路由同时接受 HEAD。认证列中的「登录」指有效会话 Cookie；「管理员」指 `role === 'admin'`。

### 3.1 `GET /api/bootstrap` —— 首屏聚合

**认证**：无（匿名返回阉割版）。**限流**：无。

首屏一次取齐：当前用户、站点配置、全部投稿、表情汇总、各题对战池规模、排行总计、我的计数、管理员待审数。

```json
{
  "user": { "id": "…", "name": "alice", "role": "member" },
  "site": {
    "content": "http://{token}.localhost:5180",
    "cdn": ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "esm.sh", "fonts.googleapis.com", "fonts.gstatic.com"],
    "capture": true,
    "efforts": ["Low", "Medium", "High", "XHigh", "Max"],
    "emojis": ["👍", "❤️", "🔥", "🤯", "👏", "👀"],
    "limits": { "uploadBytes": 31457280, "coverBytes": 3145728, "pendingPerUser": 5, "provisionalGames": 30 }
  },
  "works": [ /* 全部未删除投稿的公开视图，按创建时间倒序 */ ],
  "reactions": {
    "counts": { "task-id/work-id": { "🔥": 3 } },
    "mine": { "task-id/work-id": ["🔥"] }
  },
  "arena": { "chinese-architecture": { "works": 40, "entries": 33, "uploads": true } },
  "totals": { "votes": 128, "voters": 17, "entries": 33 },
  "me": { "votes": 12, "pending": 1 },
  "review": null
}
```

- `site.content` 为作品 origin 模板，`{token}` 占位；前端无需自行替换（`scene` / `preview` 均为替换好的完整 URL），此字段仅供诊断与展示。
- `works` **包含未验证与存疑投稿**（不含馆藏作品，馆藏经数据包分发），访客可见非特权字段。
- `arena[题目]`：`works` = 对战池作品数（馆藏 + 已验证投稿），`entries` = 不同「模型+档位」配置数，`uploads` = 该题是否接受上传。
- 匿名：`user`、`me` 为 `null`，`reactions.mine` 为 `{}`；`review` 仅管理员非 null（`{ "unverified": <待审数> }`）。

### 3.2 `POST /api/auth/register` —— 注册

**认证**：无。**限流**：auth 桶（10 次/分钟/IP）。

请求体：`{ "name": "…", "password": "…" }`

成功 `200`（**同时种下会话 Cookie，即注册即登录**）：

```json
{ "user": { "id": "…", "name": "alice", "role": "member" } }
```

错误：`400` 用户名 / 密码不合规；`409` 用户名已被使用；`415`；`429`。

### 3.3 `POST /api/auth/login` —— 登录

**认证**：无。**限流**：auth 桶。请求体同注册。

成功 `200`：`{ "user": … }` 并种下会话 Cookie。错误：`401 用户名或密码不正确`（对不存在的账号同样执行哈希比较，不泄露账号是否存在）；其余同 3.2。

### 3.4 `POST /api/auth/logout` —— 登出

**认证**：无（无会话亦为成功）。**限流**：无。请求体：无。

响应：`{ "ok": true }`，删除服务端会话并清空 Cookie。

### 3.5 草稿：`POST /api/drafts` 与 `DELETE /api/drafts/:id`

草稿是「上传 → 检查 → 试加载 → 确认提交」流水线的中间态，有效期 24 小时。

**`POST /api/drafts?task=<题目id>&name=<文件名>`**

**认证**：登录。**限流**：drafts 桶（12 次/10 分钟/用户）。**请求体**：原始 ZIP 或单个 HTML 文件的二进制（**非 JSON**），上限 30 MB。

服务端解包并静态检查（不执行任何上传代码）：拒绝分卷 / 加密 / ZIP64 压缩包、符号链接、依赖目录与密钥文件、危险路径；要求根目录（或 `dist/`、`build/`、`out/`）存在 `index.html`，或包内恰有一个顶层 HTML；入口引用的关键脚本 / 样式缺失直接 `400`。解压后总大小 ≤150 MB、单文件 ≤50 MB、文件数 ≤2000。

成功 `200`：

```json
{
  "draft": {
    "id": "…", "task": "chinese-architecture",
    "sourceName": "mine.zip", "root": "", "entry": "index.html",
    "files": 12, "bytes": 183411,
    "checks": [
      { "id": "format", "state": "ok", "label": "文件格式", "detail": "ZIP · 12 个文件 · 解压后 179.1 KB" },
      { "id": "entry", "state": "ok", "label": "入口页面", "detail": "index.html" },
      { "id": "local", "state": "ok", "label": "本地资源", "detail": "…" },
      { "id": "external", "state": "warn", "label": "外部资源", "detail": "…" },
      { "id": "readme", "state": "info", "label": "说明文件", "detail": "…" },
      { "id": "duplicate", "state": "ok", "label": "重复检测", "detail": "未发现与已有作品相同的内容" }
    ],
    "preview": "http://d<32hex>.localhost:5180/",
    "expiresAt": "2026-09-28T08:00:00.000Z"
  }
}
```

- `preview` 为草稿试加载 origin（`d` 令牌，24 小时后失效），iframe 打开后由内容服务器注入探针脚本 `__sp_probe.js`。
- `checks[].state` 取值 `ok` / `info` / `warn`；`duplicate` 项在上传内容与馆藏或他人投稿完全相同时为 `warn`。
- 每位用户最多同时保留 3 份草稿（`draftsPerUser`），超出时最旧的自动废弃。

错误：`401` 未登录；`404 题目不存在`；`409 提示词原文尚未公开，暂不接受上传`；`400` 各类包体 / 内容问题；`413` 超 30 MB；`429`。

**`DELETE /api/drafts/:id`** —— 丢弃草稿

**认证**：登录（仅草稿所有者）。响应 `{ "ok": true }`。错误：`404 试加载已结束`（草稿不存在或非本人）。

### 3.6 投稿：`POST /api/works` 与 `DELETE /api/works/:task/:id`

**`POST /api/works`** —— 由草稿正式投稿

**认证**：登录。**限流**：write 桶。**请求体上限 6 MB**（封面为 base64 data URL 内嵌）。

```json
{
  "draftId": "…",
  "confirmed": true,
  "title": "体素小城",
  "summary": "……", "note": "……",
  "modelId": "grok-4.6",
  "modelName": "（无 modelId 时必填）", "vendor": "（选填）",
  "effort": "High",
  "tool": "CLI",
  "cover": "data:image/webp;base64,…",
  "trial": { "loaded": true, "loadMs": 120, "errors": 0, "errorSamples": [], "failedResources": [], "blocked": [], "canvases": 1, "media": 3, "words": 120 }
}
```

- `confirmed` 必须为 `true`（作者已在试加载中确认运行正常），否则 `400`。
- 模型二选一：`modelId` 命中数据包模型表，或自填 `modelName`。
- `trial` 为试加载探针回传数据，服务端逐字段消毒（数值截断、字符串截长、样例限条数）。
- `cover` 仅接受 PNG / JPEG / WebP（魔数校验），≤3 MB。

成功 `200`：`{ "work": <作品公开视图> }`。作品初始状态 `unverified`，并自动排队无头截图（1440×900 与 390×844 两档，写回 `captures`；截图能力可用性见 `bootstrap.site.capture`）。

错误：`401`；`404 试加载已过期`；`400`（未确认 / 缺标题 / 缺工具 / 模型不存在或缺失 / 封面无效）；`413 封面图片不能超过 3 MB`；`429 你已有 5 件作品在等待核验`（`pendingPerUser`）。

**`DELETE /api/works/:task/:id`** —— 删除投稿

**认证**：登录，且为作者本人或管理员。响应 `{ "ok": true }`。

错误：`401` / `403 只能删除自己上传的作品`；`404 作品不存在`；`409 馆藏作品由仓库收录流程管理`（馆藏作品不可经 API 删除）。

### 3.7 审核与互动

**`POST /api/works/:task/:id/review`** —— 审核投稿（仅管理员）

**认证**：管理员。请求体：

```json
{ "status": "verified", "reason": "（questioned 时必填，≤500 字）",
  "modelId": "（选填：审核时顺带纠正模型归属）", "modelName": "…", "vendor": "…", "effort": "…" }
```

- `status` 取值 `verified` / `questioned` / `unverified`；`questioned` 必须给 `reason`（`400` 否则）；置为 `verified` 会清空理由。
- 仅当请求体出现 `modelId` / `modelName` 键时才重取模型身份，否则保持原值；`effort` 同理。

成功 `200`：`{ "work": <作品公开视图（管理员视角，含特权字段）> }`。错误：`401` / `403 仅管理员可以操作`；`404`；`400 审核结果无效`。

**`POST /api/works/:task/:id/reactions`** —— 表情反应（开关式）

**认证**：登录。**限流**：write 桶。请求体：`{ "emoji": "🔥" }`。

同一用户对同一作品的同一表情**再次提交即取消**（toggle）。响应：

```json
{ "counts": { "🔥": 3, "👍": 1 }, "mine": ["🔥"] }
```

错误：`401`；`404 作品不存在`；`409 存疑作品仅供参考，不能再互动`；`400 不支持这个表情`（表情须在 `bootstrap.site.emojis` 白名单内）。馆藏作品同样可互动。

**`GET /api/me`** —— 我的投稿与票数

**认证**：登录。响应：

```json
{ "works": [ <本人投稿公开视图，含特权字段> ], "votes": 12 }
```

**`GET /api/review`** —— 审核台（仅管理员）

**认证**：管理员。响应：

```json
{
  "works": [ <全部投稿公开视图，管理员视角> ],
  "audit": [ { "at": "…ISO…", "actor": "alice", "action": "submit", "task": "…", "work": "up-…", "detail": "…" } ]
}
```

`audit` 为审计日志倒序最多 200 条，`action` 取值含 `submit` / `verified` / `questioned` / `unverified` / `delete`。

### 3.8 `POST /api/arena/matches` —— 创建盲投对战

**认证**：无（匿名可创建，但不计票）。**限流**：matches 桶（60 次/分钟）。

请求体：`{ "task": "chinese-architecture", "previous": "<上一场对局id，选填>" }`

成功 `200`：

```json
{ "id": "…24hex…", "task": "chinese-architecture",
  "a": "http://m<32hex>.localhost:5180/", "b": "http://m<32hex>.localhost:5180/",
  "counted": true }
```

- `a` / `b` 为两侧作品的**不透明令牌 origin**（`m` 令牌，对局有效期 3 小时），iframe 直接加载；页面与地址均不泄露作品 / 模型身份。左右顺序随机。
- `counted`：登录用户恒 `true`，匿名恒 `false`。
- 抽样规则：先抽两个不同「模型+档位」配置，再各抽一件作品；偏向对局数少的配置、偏向实力相近者（同档 90% 概率软匹配，分差过大重掷 2 次）；避开上一场两侧作品、本人作品与已评组合。
- `previous` 缺省时，登录用户自动取本人该题最近一场对局作为「上一场」回避。

错误：`404 题目不存在`；`409 + code:"insufficient"` 对战池不足两个配置；`409 + code:"exhausted"` 该用户已评完全部组合；`429`。

### 3.9 `POST /api/arena/matches/:id/vote` —— 投票并揭晓

**认证**：无（但匿名票**不计入**排行）。**限流**：write 桶。

请求体：`{ "choice": "a" }`（`a` / `b` / `tie` / `skip`）。

成功 `200`（注意：**不计票也返回 200**，以 `counted` / `reason` 区分）：

```json
{ "choice": "a", "counted": true, "reason": "",
  "a": <作品公开视图>, "b": <作品公开视图> }
```

- 响应的 `a` / `b` 即**揭晓**：投票后返回两侧作品的完整公开视图（含模型名）。
- `counted=false` 时 `reason` 取值：`skipped`（skip）、`anonymous`（未登录）、`changed`（投票时某侧作品已失效）、`own`（涉及本人作品）、`duplicate`（已评过该组合）。
- `skip` 同样终局化对局，但不产生投票记录。
- 对局绑定创建者：登录用户创建的对局仅本人可投；匿名创建的对局任何人可投（但仍不计票）。
- 作品被标记存疑 / 删除后，其参与的历史投票**即时退出**排行统计；恢复验证后自动回归。

错误：`404 这一组已经失效`（对局不存在 / 过期 / 非本人）；`409 这一组已经提交过了`；`400 选择无效`；`429`。

### 3.10 `GET /api/leaderboard` —— 排行榜

**认证**：无。**限流**：无。

查询参数：`task=<题目id>`（缺省为全部题目合计）；`by=config`（默认，按「模型+档位」）或 `by=model`（按模型跨档位合计）。

```json
{
  "task": null, "by": "config",
  "totals": { "votes": 128, "voters": 17, "entries": 33 },
  "rows": [
    { "rank": 1, "key": "grok-4.6|high", "model": "grok-4.6", "modelName": "Grok 4.6", "vendor": "xAI",
      "effort": "High", "score": 1082, "interval": 96, "games": 41, "wins": 25, "draws": 4, "losses": 12,
      "winRate": 0.6585, "voters": 15, "tasks": 3, "works": 2, "provisional": false }
  ],
  "unranked": [ { "key": "…", "model": "…", "modelName": "…", "vendor": "…", "effort": "…", "works": 1 } ],
  "provisionalGames": 30,
  "updatedAt": "2026-09-27T08:00:00.000Z"
}
```

- 评分算法：Bradley–Terry 模型（平局各计半胜，弱先验 N(0,1)），映射到 Elo 刻度——均值 1000，400 分对应十倍胜率差；`interval` 为 95% 不确定区间半宽。与顺序无关。
- `provisional`：对局数 < `provisionalGames`（30）者为暂定。
- `unranked`：池内存在但尚无计入对局的配置，按模型名字典序排列。
- 排行在票数或作品状态变化时失效重建，并以数据包版本参与缓存键。

错误：`404 题目不存在`（`task` 参数无效）。

### 3.11 `/media/*` —— 投稿媒体

`GET /media/<work-id>/<file>`，其中 `<work-id>` 形如 `up-XXXXXXXX`，`<file>` ∈ `cover.png` / `cover.jpg` / `cover.webp` / `first.jpg` / `mobile.jpg`。

- 响应头：`Cache-Control: public, max-age=300`、`Content-Security-Policy: default-src 'none'`（防止媒体被当页面执行）。
- 404：`{ "error": "文件不存在" }`。
- 路径越界（`..` 等）在路径解析层被拒，等同 404。

### 3.12 作品内容伺服（令牌子域）

内容端口（默认 5180）按 Host 首段令牌伺服作品，规则 `^[wmd][0-9a-f]{32}$`：

| 前缀 | 令牌来源 | 指向 | 有效期 | 注入脚本 | Cache-Control |
| --- | --- | --- | --- | --- | --- |
| `d…` | 草稿创建 | 草稿目录 | 24 小时 | `__sp_probe.js`（试加载探针） | `no-store` |
| `m…` | 对战创建 | 对局某侧作品 | 3 小时（随对局） | `__sp_fold.js`（盲投折页） | `no-store` |
| `w…` | 投稿提交（`contentKey`） | 作品目录 | 随作品存续 | 无 | `private, max-age=600` |

- 仅接受 GET / HEAD，其余方法 `405`。
- 令牌无效：`404` 错误页「作品地址无效」；令牌存在但目标不可用（草稿过期、对局结束、作品删除、对局侧作品被下架）：`410` 错误页「作品已不可用」。
- 全部响应施加沙盒 CSP：`sandbox allow-scripts allow-same-origin allow-forms allow-modals allow-popups …`，外部资源仅放行 `bootstrap.site.cdn` 白名单内的公共 CDN；`frame-ancestors` 限定为 `SITE_ORIGINS`（即作品只能被站点 iframe 嵌入）；`Referrer-Policy: no-referrer`。
- 注入脚本作为 HTML 首个 `<script>` 插入，仅作用于 `d` / `m` 令牌；`w` 令牌作品**原样伺服**。
- 目录默认入口为作品的 `entry` 字段（通常 `index.html`）。

### 3.13 站点静态文件

`GET /*`（非 `/api/`、非 `/media/`）伺服 `DIST_DIR` 内文件：目录映射 `index.html`，不存在返回纯文本 `404 Not found`。`index.html` 附加站点 CSP 与 `Referrer-Policy: same-origin`。本仓库定位下 dist 通常只放数据包，画廊前端由此直接读取 `data.json` 与馆藏作品目录（见第 4 节）。

---

## 4. 数据包契约（`dist/data.json`）

数据包由数据仓库（arenaofbias-data）构建产出，经 `DIST_DIR` 指向，**既是服务端馆藏目录的输入，也是画廊前端直接消费的静态资源**。其结构属契约的一部分。

### 4.1 顶层结构

```json
{
  "title": "同题异答",
  "subtitle": "…", "description": "…", "repo": "…",
  "models": [ <模型> ],
  "tasks": [ <题目> ]
}
```

**模型（model）**：`{ "id", "name", "vendor", "logo", "brandUrl", "brandName" }`。

**题目（task）**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` / `title` / `summary` | string | 标识 / 标题 / 简介 |
| `date` | string | 日期（`YYYY-MM-DD`） |
| `tags` | string[] | 标签 |
| `prompt` / `promptUrl` | string | 提示词原文与出处链接 |
| `promptPending` | boolean（可缺省） | 为真时该题**不接受上传**（服务端据此置 `acceptsUploads=false`） |
| `sandtable` / `sceneProfile` | 可缺省 | 沙盘 / 场景档案标记 |
| `conditions` | array | 截图条件 `[{ "id", "label", "note", "mobile" }]`，`id` 与馆藏作品的 `captures` 键对应 |
| `results` | array | 馆藏作品列表 |

**馆藏作品（result）**：

| 字段 | 说明 |
| --- | --- |
| `id` | 题目内唯一 |
| `model` | 模型 ID（对应 `models[].id`） |
| `effort` / `sourceLabel` | 档位 / 来源标签（服务端映射为 `tool`） |
| `title` / `summary` / `addedAt` | 标题 / 简介 / 收录时间 |
| `scene` | 作品目录相对路径（如 `results/grok-4.6/`），画廊前端按静态路径直接加载 |
| `source` / `readme` | 源码 / 说明链接 |
| `gallery` | `[{ "src", "caption" }]` 图集 |
| `captures` | `{ "条件id": "截图相对路径" }` |
| `previewModel` / `previewLoader` / `captureNote` / `guide` | 沙盘预览等可缺省字段 |

### 4.2 更新方式与缓存

- 服务端 `server/catalog.mjs` 每次访问前比较 `dist/data.json` 的 **mtime**：mtime 不变则沿用内存副本，变化则整包重载。因此**更新数据包无需重启服务**，替换文件（mtime 变化）即生效。
- catalog 版本号（即该 mtime）参与排行榜缓存键；数据包更新后相关缓存自动失效。
- 馆藏作品目录（`scene` 指向的目录）由站点静态伺服直接分发，不走 API。
- 注意：**mtime 不变化的内容改写不会被感知**（如某些 CI 检出方式会保留 mtime），部署时应保证文件以新写入方式落地。

### 4.3 消费方注意点

- 服务端仅以 `id`、`title`、`promptPending`、`results[].id/model/effort/title/summary/sourceLabel/scene/captures/gallery` 参与平台逻辑（对战池、重复检测、模型表）；其余字段平台不校验，由画廊前端自行解释。
- 馆藏作品在平台 API（`bootstrap.works`、对战揭晓等）中**不携带 `scene` 字段**；需要播放馆藏场景的前端应以数据包 `scene` 路径为准。**待拍板**：娱乐面若也要经平台统一播放馆藏作品，是扩展 `toPublic` 下发 `scene`，还是娱乐面同样消费数据包，需双方确认。
- 服务端重复检测会读取馆藏作品 `scene/index.html` 的 SHA-256，数据包内该文件缺失时该作品不参与重复比对（不报错）。

---

## 5. 计划新增（未实现，计划中）

以下各项**在当前代码中不存在**，列入契约仅为双方对齐方向；实现前以单独 PR 补充正式文档：

1. **votes 表 `source` 列**：区分票源——娱乐面 / 正式盲评 / 历史迁移。配套迁移追加至 `MIGRATIONS`，排行统计按票源加权或过滤的规则另行拍板。关联现状：当前匿名投票完全不落库（见 3.9），娱乐面开放匿名计票需一并拍板。
2. **users 表 `email` / `email_verified_at` / `hash_params` 列**：邮箱与验证时间、密码哈希参数留档（为将来哈希参数升级做平滑迁移）。
3. **猜模型端点（模一把）**：移植自 Show1——先投票后猜模型或猜对加成的玩法端点，形态待定。
4. **评论端点**：作品评论的读写接口，表结构与审核规则待定。
5. **校准写回端点**：画布 / 视角校准结果写回馆藏或投稿作品的接口。
6. **邮箱验证码与 Turnstile**：注册 / 登录的人机校验与邮箱验证流程；上线后 auth 桶限流策略预计同步调整。

---

## 6. 版本与变更纪律

1. 本文档与 `server/` 代码同库维护；**凡契约变更（端点、字段、状态码、限制、数据包结构）必须先改文档、走 PR，经两个前端负责方过目后方可合并**。
2. **字段只增不减**：已发布响应中的字段不得删除、不得改名、不得改变语义；新增字段默认缺省 / 可空，前端对未知字段一律忽略。破坏性格式变更通过新增端点或显式版本化进行，不原地修改。
3. 数据库表结构变更只允许在 `server/db.mjs` 的 `MIGRATIONS` 末尾追加幂等迁移（PRAGMA `user_version` 驱动），不改写已发布迁移。
4. 错误 `error` 文案面向用户、可随时调整，**不构成契约**；契约只承诺状态码与 `code` 字段。
5. 限流额度为运营参数，调整不视为契约变更，但应在本文档 1.6 节同步更新。
6. 本文档中标有「**待拍板**」的条目为与代码现状有出入或尚未决策之处，逐条拍板后更新文档并消除标记。
