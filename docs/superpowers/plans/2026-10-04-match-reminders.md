# 关注比赛提醒实施计划

目标：交付关闭网页后仍可接收的官方比赛提醒与明确选择的日历导入。
设计：`docs/superpowers/specs/2026-10-04-match-reminders-design.md`
执行：本会话原生实现并进行独立审查；按用户已有授权完成、测试、推送与构建。

约束：Node >=22；不使用 web_search、收费 API；只信任官方时间；iOS 16.4+ 主屏幕 HTTPS；默认关闭通知与日历；保存到 MATCHPOINT_DATA_DIR。

## 审查重点

- 官方缓存失效与改期，避免按旧时间误发。
- 各设备凭证隔离、推送 URL 校验与请求限制。
- 拒绝权限、离线保存、未成功订阅不显示已开启。
- 重启去重、失败重试与关闭时写入完整。
- 中文 ICS 的字节折行、注入与准确时区；导入不意味着自动更新。

## 任务

1. 测试先行：创建 `tests/reminders.test.mjs`、`tests/calendar.test.mjs`、提醒 API 行为测试；观察缺失实现导致失败。
2. `server/reminders.mjs`：`createReminderService({directory,readFeed,send,now,subject})`，提供 config/upsert/remove/test/tick/start/close。持久化密钥、订阅与发送记录，调度读取官方数据。
3. `server.mjs`：注入提醒服务、受限 JSON 请求、来源校验、设备凭证、启动和关闭集成。`Dockerfile` 安装锁定生产依赖。
4. `src/calendar.js`：`createCalendar(match,{minutes,teams,now})` 生成标准 ICS；测试 UTC、中文、转义与提前提醒。
5. `src/reminders.js`、`src/app.js`、`src/views/schedule.js`、`src/state.js`、`styles.css`：设置、授权、订阅同步、取消与日历入口；`sw.js` 接收和安全跳转。
6. 新增浏览器验证：默认值、存储、权限流程、日历导出、移动端、SW 推送事件。运行完整 Node 测试与语法验证。
7. 更新部署说明、Compose 可选 VAPID 联系人、版本 1.1.0；独立审查修复后提交推送，确认 Actions 验证与 Docker Hub 发布。

## 执行记录

- 任务 1～6：已完成。缺失模块测试先失败再实现，审查追加的六个回归也先失败再通过。
- 采用当前用户已经授权的修改、推送和镜像发布流程；直接执行本会话计划，避免重复审批。
- 初次审查工具被自动拦截，功能审查成功完成；并发慢推送、替换订阅去重、多标签页同步、过期取消、代理后的设备配额、取消状态清理均已修复。
- 服务器按浏览器厂商隔离队列，每个队列 8 个并发任务发送，避免一个厂商不可达拖住其他厂商；客户端 Web Locks 串行化同设备操作和失败回滚。不支持 Web Locks 的浏览器仍通过端点比对避免旧 DELETE 删除新订阅。分块 DELETE 同样解析并限制请求内容。
- 已验证 27 项原有浏览器检查、6 项提醒浏览器检查、生产路由冒烟。iPhone 实机锁屏推送留给 HTTPS 部署后的“发送测试通知”验证。
- 最终审查确认三项后续边界修复通过，独立重跑 20 项针对性测试全部通过。完整测试 116 项通过，语法检查 65 个文件通过。
- 任务 7：文档、版本及审查完成，提交并由现有 Actions 执行镜像发布；最终运行链接以本次交付消息为准。
