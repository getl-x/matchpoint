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
git tag v1.0.0
git push origin v1.0.0
```

流水线先运行 Node 测试、语法检查、真实 Docker 构建和 Compose 冒烟，验证非 root、只读文件系统、健康检查、前端/PWA 文件、缓存图标、容器重建后卷数据保留，之后构建 `linux/amd64,linux/arm64` 并发布。

标签规则：推送 main 发布 latest；版本标签 v1.0.0 发布 1.0.0 与 1.0；所有发布带 sha- 标签，手动运行可指定 edge 等自定义标签。版本应固定到具体标签或摘要，避免不可预期更新。

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
HOST=0.0.0.0 PORT=4177 MATCHPOINT_DATA_DIR=/var/lib/matchpoint npm start
```

环境变量：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| HOST | 127.0.0.1 | 监听地址；镜像设为 0.0.0.0 |
| PORT | 4177 | 1—65535 的整数 |
| MATCHPOINT_DATA_DIR | 项目 data 目录 | 自定义持久化根目录；镜像为 /app/data |
| MATCHPOINT_ARCHIVE_SYNC | true | 是否启动定期官方历史发现；false 用于隔离的容器验收 |

原本不设置数据目录的本地预览仍沿用 assets 图标缓存，兼容既有文件。容器显式设置数据目录，图标统一写 logos/。`false` 只停止自动历史发现，不禁止用户访问官方实时来源或按按钮同步。
