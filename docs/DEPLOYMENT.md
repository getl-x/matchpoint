# 部署、升级与镜像发布

## 1. 运行条件

Docker Engine + Docker Compose v2；服务器需要联网读取游戏官方公开页面和 CDN。推荐至少 512 MB 可用内存。应用单容器，无数据库、Redis、付费 API 或模型服务依赖。

应用在容器内监听 `0.0.0.0:4177`，用户为 Node 的 UID/GID `1000:1000`，只读根文件系统，只向 `/app/data` 和 `/tmp` 写入。启动会验证数据目录可写；目录权限错误会直接退出，而不是启动后悄悄丢失数据。

## 2. Docker Hub 发布配置

GitHub 仓库：<https://github.com/getl-x/matchpoint>。Docker Hub 目标：`getl/matchpoint`。

在 Docker Hub 创建具有目标仓库 **Read & Write** 权限的 Personal Access Token，不使用账号密码。随后到 GitHub 仓库 Settings：

1. Secrets and variables → Actions → Variables：添加 `DOCKERHUB_USERNAME`，值为 `getl`。
2. Secrets and variables → Actions → Secrets：添加 `DOCKERHUB_TOKEN`，值为上述 Token。
3. Docker Hub 用户必须对 `getl/matchpoint` 有推送权限；确认仓库及可见性符合自己的部署方式。

也可以使用已登录的 GitHub CLI，Token 通过交互输入，不写入命令行、源代码、`.env` 或聊天：

```bash
gh variable set DOCKERHUB_USERNAME --body getl --repo getl-x/matchpoint
gh secret set DOCKERHUB_TOKEN --repo getl-x/matchpoint
```

其他 GitHub 仓库的 Secret 不会自动继承，也不能通过 API 读回。

配置后运行 Actions → **Build and publish Docker Hub image** → Run workflow。正式版本使用 Git 标签：

```bash
git tag v1.1.1
git push origin v1.1.1
```

流水线先运行 Node 测试、语法检查、真实 Docker 构建和 Compose 冒烟，验证非 root、只读文件系统、健康检查、前端/PWA 文件、缓存图标、容器重建后卷数据保留，之后构建 `linux/amd64,linux/arm64` 并发布。

标签规则：推送 main 发布 latest；版本标签 v1.1.1 发布 1.1.1 与 1.1；所有发布带 sha- 标签，手动运行可指定 edge 等自定义标签。版本应固定到具体标签或摘要，避免不可预期更新。

缺少 Token 时，Registry 检查会明确说明 **not published**，publish Job 跳过，测试/真实镜像构建仍运行。Actions 的绿色检查不能单独作为已经推到 Docker Hub 的证据：应查看 publish Job 和步骤摘要中的镜像标签/摘要。

## 3. 普通 Compose

仓库根目录包含可直接使用的 `compose.yml`：

```bash
cp .env.example .env
# 编辑 MATCHPOINT_IMAGE，填写确实已发布的标签
docker compose pull
docker compose up -d --wait
docker compose ps
curl --fail http://127.0.0.1:4177/healthz
```

返回包含 `status: ok` 和版本号；健康仅代表应用和存储可用，不保证某个游戏官网始终可访问。每个官方来源的同步/缓存状态在网页内分别展示。

默认端口绑定 `127.0.0.1`，供同机反向代理使用。需要局域网直连时在 `.env` 设置 `MATCHPOINT_BIND=0.0.0.0`；改端口用 `MATCHPOINT_PORT`。普通远程 HTTP 不满足 PWA 安装和离线能力所需的安全上下文，正式部署使用 HTTPS。

还没有 Registry 镜像或希望自己构建：

```bash
# .env 中将 MATCHPOINT_IMAGE 改为 matchpoint:local
docker compose -f compose.yml -f compose.build.yml up -d --build --wait
```

本机没有 Docker 时，也可从成功的 Actions verify Job 下载 `matchpoint-docker-amd64` 产物，解压外层 zip 后：

```bash
docker load -i matchpoint-docker-amd64.tar.gz
MATCHPOINT_IMAGE=matchpoint:ci docker compose up -d --wait
```

该下载包仅 amd64；发布流程的正式 Registry 镜像才包含 amd64 与 arm64。

## 4. HTTPS 与 iOS PWA

将真实域名 DNS 指向服务器，开放 80/443，设置 `.env`：

```dotenv
MATCHPOINT_DOMAIN=esports.example.com
MATCHPOINT_BIND=127.0.0.1
```

然后：

```bash
docker compose -f compose.yml -f compose.https.yml up -d --wait
```

Caddy 自动申请证书、反向代理到 `app:4177` 并压缩响应。Safari 打开 `https://真实域名/schedule`，分享 → 添加到主屏幕。所有路径在域名根目录，不支持随意添加子路径前缀。也可以用已有 nginx/Caddy/Traefik，代理网页、`/api/*`、`/assets/*` 和 Service Worker，保留同域访问。

## 5. 数据、首次同步和旧预览迁移

命名卷 `matchpoint_data` 保存：

- `archive/`：官方历史索引、赛事、积分和图模型。
- `feeds/`：近期赛程与积分的真实官方快照，服务器重启后外部来源失败时仍可回退，读取时间保持原值。
- `logos/`：下载的官方 Logo 和 `team-logos.json`。公开图片 URL 继续是 `/assets/team-logo-*.png` 等。
- `reminders/`：VAPID 密钥、匿名设备推送订阅、关注 ID 和发送去重记录。此目录包含私密设备信息，应随卷备份，不公开、不提交到 Git。

镜像只包含代码与产品静态资源，不包含开发电脑上下载的官网数据、图标或截图。首次启动会从官方目录逐步补齐存档，并显示进度。官方没保留或不可读的记录只做明确标记，不生成模拟数据。

原电脑预览的历史数据如需保留：先停止旧服务与目标容器，将旧项目的 `data/archive/` 拷贝到卷内 `archive/`，如有 `data/feeds/` 也拷贝到 `feeds/`；将旧 `assets/team-logos.json` 和 `assets/team-logo-*` 拷贝到卷内 `logos/`。不要把整个 assets 目录挂到容器 `/app/assets`，否则空卷会遮蔽应用图标。文件归属应为 `1000:1000`，然后启动服务。

自定义宿主机目录可将 Compose 卷改成 `./matchpoint-data:/app/data`。先创建目录并赋予容器用户权限；Windows/NAS 的权限方式因系统而异。

## 6. 升级、日志与备份

```bash
# 将 .env 中 MATCHPOINT_IMAGE 改为已发布新版本
docker compose pull
docker compose up -d --wait
docker compose logs --tail=100 app
```

不要为升级运行 `down --volumes`；那会删除历史数据。数据格式没有改变，存档图布局可从原始官方赛果重建。外部来源更正按现有定期复核规则同步，失败不覆盖旧记录。

一致性备份建议暂停应用，使用同一镜像和数据卷导出（在 Linux/NAS 的 shell 执行）：

```bash
docker compose stop app
docker compose run --rm --no-deps --entrypoint sh app -c 'tar -C /app/data -czf - .' > matchpoint-data-backup.tar.gz
docker compose start app
```

备份包含所有已保存的官方存档和图标；浏览器个人关注与主题仍在用户本地浏览器。恢复前停止应用，将备份展开到 `/app/data` 的卷内，确保属主 `1000:1000` 再启动。测试环境 `scripts/container-smoke.sh` 只清理随机命名的 CI 项目卷，不清理生产卷。

## 7. Node 原生运行

需要 Node 22+，推荐 24 LTS：

```bash
npm ci --omit=dev --ignore-scripts
HOST=0.0.0.0 PORT=4177 MATCHPOINT_DATA_DIR=/var/lib/matchpoint npm start
```

环境变量：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| HOST | 127.0.0.1 | 监听地址；镜像设为 0.0.0.0 |
| PORT | 4177 | 1—65535 的整数 |
| MATCHPOINT_DATA_DIR | 项目 data 目录 | 自定义持久化根目录；镜像为 /app/data |
| MATCHPOINT_ARCHIVE_SYNC | true | 是否启动定期官方历史发现；false 用于隔离的容器验收 |
| MATCHPOINT_PUSH_SUBJECT | https://github.com/getl-x/matchpoint | Web Push VAPID 联系地址，可填写自己的 HTTPS 网站或 mailto:邮箱；无需申请收费服务 |

原本不设置数据目录的本地预览仍沿用 assets 图标缓存，兼容既有文件。容器显式设置数据目录，图标统一写 logos/。`false` 只停止自动历史发现，不禁止用户访问官方实时来源或按按钮同步。

## 8. 开赛提醒和日历（1.1.0 起）

使用原来的 Compose 和数据卷即可升级，首次启动自动生成 VAPID 密钥并持久化。无需添加 GitHub Secret、申请推送 API Key 或购买服务。不要删除 `reminders/keys.json`，否则原设备需要重新开启通知。一个数据卷只由一个应用实例写入。

服务器必须能通过 HTTPS 访问浏览器厂商推送端点：Apple 的 `web.push.apple.com` / `*.push.apple.com`、Chrome 的 `fcm.googleapis.com`、Firefox 的 `updates.push.services.mozilla.com`、Edge 可能使用的 `*.notify.windows.com`。这些是浏览器的免费传输服务；某些地区或网络可能无法连通，测试失败时先检查容器出站网络。

反向代理请保留原始 `Host` 和浏览器的 `Sec-Fetch-*` 请求头，同域代理 `/api/reminders/*`，允许 GET、PUT、DELETE、POST，不缓存这些接口。1.1.1 起，带 `Sec-Fetch-Site: same-origin` 的浏览器请求也兼容代理将上游 `Host` 改成容器地址；没有该请求头的浏览器仍需代理保留原始 `Host`。跨站和同站但不同源的修改请求会被拒绝，每个设备的随机凭证仍然必需。

提醒订阅绑定用户当前设备的随机凭证；没有账户，也不跨设备同步关注。服务器每 30 秒检查一次有关注的游戏，官方数据缓存为 1 分钟。通知尽力发送，不能承诺在精确秒数送达；官方来源不可读或缓存过期时不按旧时间误发。每台设备最多关注 200 场提醒，单实例最多 1000 台提醒设备；90 天不更新的设备会被清理，返回应用即可重新同步。

用户使用步骤：

1. iPhone / iPad 更新到 iOS / iPadOS 16.4 或更新版本，用 Safari 访问 HTTPS 站点 → 分享 → 添加到主屏幕。
2. 从主屏幕打开赛点，星标关注未来比赛，点击顶部铃铛或“我的关注”的“提醒设置”。
3. 选择 5 / 10 / 15 / 30 / 60 分钟，或输入 1～1440 的整数，点击“开启通知提醒”并允许系统权限。通知和日历默认关闭。
4. 点击“发送测试通知”，确认设备收到明确标为测试的通知。再检查系统“设置 → 通知”及专注模式。
5. 可选勾选“显示添加到日历选项”并保存，再主动点击某场比赛的“添加到日历”。也可直接从未来比赛详情点击“添加日历提醒（可选）”。系统需要确认导入，网页不会静默写日历。

1.1.1 起，系统允许通知后按钮立即显示“已授权，连接中…”，订阅成功后变为绿色“已开启 · 关闭提醒”。授权成功但连接失败会显示“已授权 · 重试开启”，同时说明失败原因；修复网络或升级服务后点击重试，无需重复申请系统权限。关闭提醒后仍显示“已授权 · 开启提醒”，因为手机的通知权限继续保留。

ICS 使用官方开赛 UTC 时间，日历应用转换为设备时区；VALARM 使用选定提前分钟数。没有官方结束时间就不填写结束时间。已导入的日历是快照，官方改期后需重新导入或修改；稳定事件 UID 有助于识别同一场比赛，但不同日历应用对重复导入行为不同。通知的时间仍自动跟随官方更新。服务器、设备网络、系统权限和专注模式都会影响通知；此仓库的浏览器测试不替代真实 iPhone 锁屏验收。

自定义服务名为 `matchpoint` 的部署升级：

```bash
docker compose pull matchpoint
docker compose up -d matchpoint
```

浏览器再次打开时更新 PWA，旧关注和主题保留。若关闭提醒时暂时离线，应用会先取消本机订阅，联网后重试删除服务端记录。
