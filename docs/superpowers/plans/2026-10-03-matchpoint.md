# Matchpoint Implementation Plan

**Goal:** 完成能直接预览和操作的四游戏赛程与自动晋级 PWA 初版。
**Architecture:** 使用独立演示数据、纯函数晋级引擎、localStorage 状态和原生页面组件；本地 Node 静态服务。
**Tech Stack:** HTML, CSS, ES Modules, Node.js，全部运行文件本地提供。
**Spec:** ../specs/2026-10-03-matchpoint-design.md

## Global Constraints
- 不使用收费 API；不制作安卓客户端。
- 所有比赛标明演示数据；Apex 使用积分晋级。
- iOS 主屏幕安装需要 HTTPS；响应式最小宽度 360px。

## Review Focus
- 上游胜者改变会清除后续失效赛果。
- 平局、非法比分、未定参赛队伍不会推进对阵。
- 不同游戏的结果和积分独立保存。
- 损坏或不可写的存储不会导致空白页面。
- 手机正文无横向溢出，对阵画布允许局部横向滚动。

## Tasks
- [x] 1. 先为晋级和 Apex 排序编写行为测试，观察失败；实现纯函数并通过测试。
- [x] 2. 实现独立赛程页、日期和游戏/赛事过滤、搜索、详情与关注。
- [x] 3. 实现晋级画布、赛果操作、Apex 积分模拟、本地持久化。
- [x] 4. 完成响应式布局、PWA 图标/清单/离线缓存和安装说明。
- [x] 5. 在真实浏览器验证交互、手机布局、刷新和离线行为；保存桌面/手机截图。
