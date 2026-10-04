# 赛点 Matchpoint

CS2、无畏契约、英雄联盟和 Apex 电竞赛程、晋级图与历史查询网页，支持深浅主题、手机和 iOS PWA。当前版本 **1.1.2**。

比赛、比分、积分和战队 Logo 来自游戏官方公开来源；不提供模拟赛果或手动填队伍。通知使用开源 `web-push` 和浏览器提供的免费标准推送，不调用付费数据或模型接口。

## Docker 部署

镜像目标：`getl/matchpoint`，支持 `linux/amd64` 与 `linux/arm64`。首次发布需要在 GitHub 仓库配置 Docker Hub Token，详见[部署文档](docs/DEPLOYMENT.md)。没有 Token 时 Actions 会构建并验证镜像、提供下载包，但明确跳过 Docker Hub 发布。

```bash
cp .env.example .env
# 编辑 .env，选择已经发布的镜像标签
# 示例默认只监听本机，访问 http://127.0.0.1:4177
# 要通过局域网 IP 访问，将 MATCHPOINT_BIND 改为 0.0.0.0
docker compose pull
docker compose up -d --wait
```

尚未发布到 Docker Hub 时，可直接本地构建：

```bash
# .env 如已设置远程镜像名，请先改为 MATCHPOINT_IMAGE=matchpoint:local
docker compose -f compose.yml -f compose.build.yml up -d --build --wait
```

`matchpoint_data` 数据卷保存历史存档、近期官方快照与 Logo。换镜像不会清空数据。普通升级使用 `pull` + `up`；不要删除数据卷。

公开部署及 iPhone 添加到主屏幕需要 HTTPS。仓库提供 Caddy 示例：设置 `.env` 的 `MATCHPOINT_DOMAIN`，把域名指向服务器，然后运行：

```bash
docker compose -f compose.yml -f compose.https.yml up -d --wait
```

更多配置、备份、恢复和 Actions 发布说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 功能

- 中文赛程：游戏、赛事、日期、状态、队伍搜索和关注；比赛详情分官方与第三方观看入口。
- 只读晋级图：瑞士轮分组、独立大对阵卡片、逐轮淘汰赛；决赛在最右侧。连线来自官方公布关系或已确认的官方赛果与下一场参赛队。
- Apex 官方积分、击杀、排名和已晋级标记；不改变原有积分表逻辑。
- 官方历史目录逐步同步，按游戏、年份、关键词查询、导出图数据；官方未保留的历史明确标注。
- 官方战队图标自动下载、主题适配和缓存；官方未提供图片时显示队名缩写。
- 可见页面每分钟更新官方赛程；来源故障隔离，显示带读取时间的缓存。
- 关注比赛开赛前通知：用户主动授权，提前 1～1440 分钟可选，服务器按官方改期调整，关闭网页也可接收。
- 日历默认关闭；可手动导入带提醒的 ICS 事件，比赛改期后需要重新导入或修改日历。
- 默认深色、手机适配、离线快照、iOS 添加到主屏幕；暂未制作安卓原生客户端。

## 本机开发

Node.js 22 或更新版本，建议 Node 24 LTS。

```bash
npm ci --ignore-scripts
npm start
# http://localhost:4177/schedule
npm test
# 浏览器检查默认连接 4179，可用 TEST_URL 指定现有服务地址
npm run test:ui
npm run check:syntax
npm run smoke
```

可设置 `HOST`、`PORT`、`MATCHPOINT_DATA_DIR` 和 `MATCHPOINT_ARCHIVE_SYNC`。设置数据目录后，所有新增图标和存档写入该目录。首次启动从官网同步历史需要时间，页面会显示进度；镜像不包含本机预览积累的数据。

## 自动构建

- 推送 `main`、创建 `v*` 标签、手动运行：测试 → 构建实际镜像 → Compose 验收 → Docker Hub 发布。
- PR：仅测试和容器验收，不登录或发布镜像。
- `latest` 表示默认分支；`v1.1.2` 发布 `1.1.2`、`1.1`；每次发布都有 `sha-<commit>`。
- Actions 构建产物 `matchpoint-docker-amd64` 可以下载并 `docker load -i matchpoint-docker-amd64.tar.gz`，即使没有 Registry 凭据。

## 数据边界

无畏契约和英雄联盟读取 Riot 近期赛程及中国官方历史目录；CS2 读取 BLAST 收录的赛事；Apex 读取 EA ALGS 公开赛程和积分。并非全部游戏、全部赛区或所有杯赛，也不保证官网已删除的数据可补齐。原始数据与图标归其权利人所有。具体渠道见 [docs/SOURCES.md](docs/SOURCES.md)，历史覆盖见 [docs/ARCHIVE.md](docs/ARCHIVE.md)。

通知和页面生命周期浏览器检查使用锁定的 Playwright 开发依赖，默认运行本机 Edge；设置 `PLAYWRIGHT_CHANNEL=chromium` 并运行 `npx playwright install chromium` 可使用 Chromium。默认测试服务地址为 `http://localhost:4179`，可通过 `TEST_URL` 指定运行中的服务。Actions 自动启动隔离服务并执行这些检查；测试工具不进入生产镜像。其他整体浏览器脚本可通过 `PLAYWRIGHT_MODULE` 指定包路径。iPhone 安装与锁屏通知仍需实机验证。iOS / iPadOS 16.4+、HTTPS、从主屏幕打开应用后，点击铃铛 → 开启通知提醒；系统勿扰或专注模式、网络可能影响送达时间。
