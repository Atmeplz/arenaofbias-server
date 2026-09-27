# arenaofbias-server

Show1×Show2 融合工程的**共享后端**：整个体系中唯一的动态服务，独占数据库，负责账号、投票、排行榜、投稿审核与作品沙盒伺服。两个前端（画廊/平台 UI）各自独立部署，全部通过本服务的 HTTP API 读写数据。本仓库**不含任何前端页面**。

- 纯 Node.js（>= 22.13），**零依赖**（无 dependencies / devDependencies，无需 `npm install`）。
- 数据库为 `DATA_DIR/platform.db`（默认 `.data/platform.db`），首次启动自动创建，不进 git。
- 同时监听两个端口：站点/API 端口（默认 5173）与作品沙盒内容端口（默认 5180，每个作品以独立子域 origin 伺服，互相隔离）。

## 运行

```bash
npm start        # node server/index.mjs
npm run admin -- <用户名>   # 提升某用户为管理员（server/cli.mjs）
npm test         # node --test test/*.test.mjs
```

启动前需要**已构建好的数据包**（内含 `data.json` 与 curated 作品目录），通过 `DIST_DIR` 指向，默认 `./dist`：

- 生产环境：数据包来自 **arenaofbias-data** 仓库的构建产物，部署到本服务后由 `DIST_DIR` 指向。
- 本地开发：本仓库根目录的 `dist/`（已 gitignore）即为一份本地数据包，可直接 `npm start`。

数据包更新**无需重启服务**：`server/catalog.mjs` 每次读取 `dist/data.json` 前比较 mtime，文件变更后自动重新加载，依赖 catalog 版本的缓存随之失效。

## 环境变量（server/config.mjs）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `5173` | 站点 / API 端口 |
| `CONTENT_PORT` | `5180` | 作品沙盒内容端口 |
| `DIST_DIR` | `./dist` | 构建产物（数据包）目录 |
| `DATA_DIR` | `./.data` | 数据库与运行数据目录 |
| `CONTENT_ORIGIN_TEMPLATE` | `http://{token}.localhost:5180` | 作品 origin 模板，`{token}` 必须占满一个 host label；生产需独立泛域名 |
| `SITE_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 可信前端 origin（逗号分隔，含协议与端口），同时允许凭据 CORS、API 写操作和 iframe 嵌入作品 |
| `ADMIN_USERNAMES` | 空 | 始终持有管理员角色的用户名（逗号分隔） |
| `CONTENT_CDN_ALLOWLIST` | `cdn.jsdelivr.net,unpkg.com,cdnjs.cloudflare.com,esm.sh,fonts.googleapis.com,fonts.gstatic.com` | 作品允许加载脚本/样式/字体/数据的公共 CDN 白名单 |
| `CAPTURE` | 开（`0` 关闭） | 投稿作品的无头截图（Playwright + 本地 Chrome） |
| `CAPTURE_BROWSER` | `chrome` | 截图所用浏览器通道 |
| `COOKIE_SECURE` | 关（`1` 开启） | session cookie 加 Secure 标记 |
| `COOKIE_SAME_SITE` | `Lax` | `Lax` / `Strict` / `None`；跨站 HTTPS 部署用 `None`，并必须开启 `COOKIE_SECURE=1` |
| `TRUST_PROXY` | 关（`1` 开启） | 信任反向代理的客户端 IP 头 |

## API 概览（server/app.mjs）

站点端口（默认 5173）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/bootstrap` | 首屏聚合：当前用户、站点配置、作品列表、反应汇总、各题对战池、排行榜总计、我的投票/待审数、管理员待审计数 |
| POST | `/api/auth/register` | 注册并建立会话（限流） |
| POST | `/api/auth/login` | 登录（限流） |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/questions` | 发布社区题目，保留提示词、标签和允许的提交格式（需登录） |
| POST | `/api/drafts?task=&name=&template=` | 上传 ZIP/HTML，检查后暂存为草稿；`template=static|vite` 可选，Vite 项目必须含构建产物（需登录，限流） |
| DELETE | `/api/drafts/:id` | 丢弃草稿（需登录） |
| POST | `/api/works` | 由草稿正式投稿，入审核队列并排队截图（需登录） |
| DELETE | `/api/works/:task/:id` | 删除投稿（需登录，本人或管理员） |
| POST | `/api/works/:task/:id/review` | 审核投稿（仅管理员） |
| POST | `/api/works/:task/:id/reactions` | emoji 反应（需登录） |
| GET | `/api/me` | 本人题目、投稿、投票、近 365 天活跃热图和收到的表情（需登录） |
| PATCH | `/api/me` | 修改昵称，登录用户名不变（需登录） |
| GET | `/api/review` | 全部投稿与审计日志（仅管理员） |
| POST | `/api/arena/matches` | 创建一场盲投对战（限流） |
| POST | `/api/arena/matches/:id/vote` | 对一场对战投票（限流） |
| GET | `/api/leaderboard?task=&by=` | 排行榜，`by=config|model`，`task` 可选 |
| GET | `/media/up-xxxxxxxx/(cover.png|cover.jpg|cover.webp|first.jpg|mobile.jpg)` | 投稿的封面/截图（CSP: default-src 'none'） |
| GET | `/*` | dist 静态文件（本仓库定位下 dist 通常只放数据包，无站点页面时返回 404 属正常） |

内容端口（默认 5180）：按 `CONTENT_ORIGIN_TEMPLATE` 的 `{token}` 子域伺服单个作品目录，施加沙盒 CSP 与 CDN 白名单（见 `server/content.mjs`）。

前端独立部署时，`SITE_ORIGINS` 填前端真实 origin（不含路径或末尾 `/`），所有 fetch/XHR 携带会话凭据（`credentials: 'include'` / `withCredentials = true`）。可信来源支持 API 的 OPTIONS 预检及 `Content-Type` 请求头；不使用通配 CORS。`captures` / `cover` 的 `media/...` 路径按后端站点根解析，不能按前端路径解析。跨站 Cookie 还受浏览器第三方 Cookie 设置限制；优先采用同站域名的前端和 API 部署。

## 测试

```bash
npm test    # 19 个用例：排名、上传/审核/盲投、社区题目、昵称/热图、凭据 CORS 与 Cookie
```
