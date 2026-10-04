# 赛点生产部署规格

用户授权：把现有网站完成为可部署版本，推至 GitHub，Actions 构建 Docker 镜像并推至 Docker Hub，附示例 Compose。

保留四款游戏官方只读数据、图标、历史存档、主题、晋级图及 PWA。免费官方渠道联网；不使用 web_search、付费模型/API。不发布本机官方缓存、截图和临时研究数据。

部署使用 Node 24 LTS，无 npm 产品依赖，非 root 容器。一个 /app/data 数据卷保存历史记录和图标；前端静态资源不能被空卷遮蔽。HTTP 健康接口不依赖官方来源；HTTPS 由反向代理提供，示例兼顾直连和 Caddy。新版本升级保留卷，离线和外部故障仍显示缓存。

GitHub 仓库 getl-x/matchpoint 默认私有。Docker Hub 目标 getl/matchpoint；认证只在 Actions Secrets 中。无密钥时 CI 与容器验收仍运行，发布状态必须明确显示未发布，不能声称成功。发布具备 linux/amd64 与 linux/arm64、latest / 版本 / commit 标签。
