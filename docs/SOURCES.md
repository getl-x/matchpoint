# 官方数据与观看入口

核实日期：2026-10-03（北京时间）。所有读取均为无登录、无付费密钥的公开 HTTPS GET；没有第三方模型调用，也没有付费聚合赛事 API。

## 赛事来源

| 游戏 | 官网 / 官方 API | 当前读取方式与边界 |
| --- | --- | --- |
| 无畏契约 | https://valorantesports.com/en-US | 解析页面内 Apollo SSR EventMatch JSON，并查询官网 /api/gql 的 homeEvents 公开持久化操作补齐进行中比赛；保留官方状态、BO 赛制、比分与胜负。官网只返回近期记录；未提供下一轮关系时不推算连线。 |
| 英雄联盟 | https://lolesports.com/en-US | 同上，按官方赛事与阶段分组。 |
| CS2 | https://blast.tv/cs/tournaments | 解析官网 React Router turbo-stream，安全解码索引、Date 与延迟数据；选择当前、最近及下一场赛事（最多三个）。读取官网瑞士轮分组、淘汰图及 winnerGoesTo，不猜测分组。BLAST 收录的其他主办方赛事不等于全部 CS2 比赛。 |
| Apex | https://algs.ea.com/en / https://prod-api.algstools.com/v1 | API 基址直接见 EA 官方前端；读取 seasons/structure、series/seasons/:id、stats/phases/:id/standings。选择最新主赛季，按官方赛区、阶段、position 和 qualified 展示；不硬编码前十晋级。 |

比分与比赛状态以来源返回为准，不凭开赛时间推断正在直播。来源未公布的队伍显示“待官方公布”；未开始时不把默认 0:0 当赛果。官方排名不自行重排。

2026-10-05 核实：Riot 首页 SSR 仅查询 completed 和 unstarted，进行中比赛需另外以 eventState=["inProgress"] 读取 homeEvents。该请求使用官网公开查询清单中的操作 ID，无需登录或密钥，仍是 HTTPS GET；携带 JSON Content-Type 与 Apollo 客户端标识。进行中查询不限制开赛日期，以免漏掉跨午夜的比赛；合并时按官方比赛 ID 去重，以进行中接口记录更新旧 SSR 副本。接口失败或 GraphQL 返回错误时沿用已有快照的 stale 机制，不将缺少进行中数据的结果标为完整更新。

今日赛程也显示昨天或更早开赛、官方仍标为进行中的比赛，保留原始开赛日期；历史和未来日期仍按开赛日期筛选。跨午夜不会依照时间猜测直播状态。BLAST 某个赛事或 ALGS 某个积分阶段读取失败时，若已有快照则保留该快照及其原读取时间，并明确标为更新失败的缓存，包括旧快照本身不完整的情况；首次读取没有旧快照时，仍可展示带部分数据标记的官方结果。

请求超时 15 秒、响应上限 14 MiB；一分钟内复用服务器快照，并合并并发读取。某个来源失败时不阻塞其他来源。缓存保留原始 retrievedAt，失败后明确 stale。服务端重启后内存缓存重新读取；浏览器已读官方快照可供离线查看。

所有 HTML 数据均作为 JSON 解析，不执行下载页面的脚本。公开页面结构变化会报错，不提供虚构回退。产品服务器只允许页面、src 与 assets，不对外提供测试、研究文件或 server 源码。

## 官方渠道

- 无畏契约中国官网：https://val.qq.com/ （官方赛事入口，不标为特定场次直播间）。
- 英雄联盟赛事直播页：https://lpl.qq.com/es/live.shtml 。
- CS2 完美世界赛事中心：https://www.csgo.com.cn/match （链接由完美世界官网提供）。
- Apex 官方赛事入口：https://algs.ea.com/en 。
- BLAST 或 Riot 赛程明确提供 Twitch 频道时，将该链接列为官方转播，注明国际平台。

## 第三方直播间

以下国内入口已通过平台页面标题、主播名或平台搜索结果核实。仅表示真实赛事频道存在；不承诺它转播用户点选的每一场比赛，也不根据频道标题伪造比赛转播状态。

| 游戏 | 平台 / 频道 | 直达入口 | 核实依据 |
| --- | --- | --- | --- |
| 无畏契约 | 虎牙无畏契约赛事 | https://www.huya.com/660679 | 平台搜索列出房间；房间标题“上海全球冠军赛”、主播名“虎牙无畏契约赛事”。 |
| CS2 | 虎牙 ESLCS频道 | https://www.huya.com/483917 | 平台 ESL 搜索与房间标题“2026ESL-CS2赛事”。 |
| CS2 | 虎牙 CSGO海外赛事 | https://www.huya.com/18525099 | 平台搜索与房间标题标明 CS2。 |
| 英雄联盟 | 虎牙英雄联盟赛事 | https://www.huya.com/660000 | 平台房间标题与主播名；核实当日预告德玛西亚杯。 |
| 英雄联盟 | 斗鱼英雄联盟赛事 | https://www.douyu.com/288016 | 平台房间标题与主播名；核实当日预告德玛西亚杯。 |
| 英雄联盟 | B站赛事直播间 | https://live.bilibili.com/6 | 直播页标题德玛西亚杯，平台 Room/get_info 返回赛事区预告，真实房间 ID 7734200。 |
| Apex | 虎牙APEX赛事 | https://www.huya.com/657368 | 平台搜索与房间主播名“虎牙APEX赛事”。 |
| Apex | ShowHand 中文解说（斗鱼） | https://www.douyu.com/6828159 | EA 官方页面 Chinese Casters 列表公布此链接。属于第三方中文解说。 |

另外保留虎牙、斗鱼、B站直播搜索，各自明确标注“平台搜索 / 直播搜索”。外链在新窗口打开，使用 noopener noreferrer，不嵌入平台播放器。直播间可能改号、停止转播或只播特定赛区；目录核实日期见 src/watch.js。

## 可重复验证

npm test 使用抽取自真实官方响应的最小 fixture；不将这些 fixture 作为产品赛程回退。npm run test:browser 调用实时 /api/feed，并核对来源、日期、只读页面、ALGS 排名、观看分组、主题、响应失败和离线缓存。结果写入 docs/browser-verification.json。

## 中文赛事名称（2026-10-03 增补）

普通本机 Node HTTPS 请求读取以下免费公开目录，无登录、无密钥、不使用 web_search。

- 无畏契约：中国赛事官网 https://vct.qq.com/ 的 act-request.js 明确使用 https://val.native.game.qq.com/esports/v1/data/VAL_SGameList_display.json 。同一公开目录同时可提供中文赛程；本版用它核对赛事中文名。记录 1000074 的正式名称是“2026无畏契约全球冠军赛”。
- 英雄联盟：中国赛事官网公开目录 https://lpl.qq.com/web201612/data/LOL_MATCH2_GAME_LIST_BRIEF.js ，GameList.msg.sGameList 提供赛事中文名、年份和日期。2026 德玛西亚杯记录为 245；全球挑战者之星邀请赛为 244。读取时仅拆除固定 var GameList= 包装后解析 JSON，不执行远端 JavaScript。

中文目录按游戏、已知赛事类型、年份且唯一候选匹配，保留原始赛事名和官方目录记录 ID；年份不符或候选不唯一时不贴“官方名称”标签。目录一小时复用；读取失败仍可用原官方赛程和中文译名。

本轮没有替换 Riot 比分、比赛 ID 或赛程记录，也没有根据国内赛区名称合并国际赛事。中国官网未覆盖的国际联赛、CS2 和 ALGS 赛事采用明确的中文译名，保留 ESL、VCT、ALGS 等赛事品牌缩写。原始英文可在详情中展开核对，名称出处区分中国官方目录与中文译名。

所有赛程阶段、CS2 分组/赛制标签和 ALGS 阶段同步中文化；搜索同时索引中文显示名和原名。修改仅作用于显示，赛事筛选、关注和晋级关系仍以原始 ID 为依据。

## 晋级思维导图语义（2026-10-03）

Swiss 路径仅在 BLAST 官方明确声明 swiss 赛制、并公布可识别胜负分组时绘制。只连接已公布的相邻记录组；结果区域的名额来自 numberQualifiedTeams / numberEliminatedTeams。没有公开每场下一对手时不生成具体比赛晋级连线，也不向下一轮插入推测对手。终局分组每场唯一胜者/败者确实对应官方公布名额时才据已结束赛果填入名单。

实线仍只来自 winnerGoesTo 的官方 seriesUUID 和 bracketPosition。Riot 暂未公开 next-match 关系，图中虚线表示赛事包含官方阶段和真实对阵，不表示确定晋级对手。图形坐标、折线、样式、缩放与拖动由本站设计，赛程实体和结果保持官方来源。

## 官方历史存档（2026-10-03）

- CS 历史目录继续读取 BLAST 赛事页的 groupedFinishedTournaments，并逐赛事保存官方 brackets 和 matches。目录目前含 90 项，包含 2021 年起 CS:GO 历史赛事。
- 无畏契约：全量中国官方 VAL_SGameList.json；逐届 VAL_Match_<ID>.json、VAL_Game_<ID>.json、VAL_GAME_<ID>_promotion.json。官网 act-request.js 明确使用这些文件。目录目前 56 项已结束赛事，首个可读比赛为 2023 东京大师赛。分组与轮次采用 promotionData 的正式名称；没有具体下一场 ID 时，连线只表示包含关系。
- 英雄联盟：中国官方目录提供 2014 年起的记录，官网 schedule.js 使用 searchBMatchInfo_bak.php 查询官方比赛。本版遍历全部 totalpage，以 TeamList 官方目录解析参赛队；不执行远端 JavaScript。分页不齐时保留已读真实场次、记录 expectedMatchCount 与说明，明确标为部分数据。2014 全明星赛正赛 13 场已核实。
- APEX：ALGS /seasons 列出官网保留的赛季，逐季 /series/seasons/<ID>、逐阶段 /stats/phases/<ID>/standings；历史查询沿用官方积分榜。官网当前目录保留 Year 4 起，不声称补齐 Year 1。

另外检查 Riot 官网公开前端历史查询：官网通过公开持久化查询 ID 调用 /api/gql，直接本机请求返回 client-header 认证错误。因此没有把未取得的更早国际赛事加入产品，没有绕过认证、使用第三方付费源或编造首届数据。

持久化目录：data/archive/index.json、data/archive/events/<SHA256(赛事ID)>.json、data/archive/observed.json。每项保存官方 feed、来源/读取时间、场次、队伍、比分、分组和可还原的图布局；APEX 保存积分。服务启动及每 6 小时发现目录；部分记录每 6 小时补读，近期完成记录每天复核、旧记录每周复核官方更正。界面同步按钮可重试不可读记录。官方旧来源删除时已保存数据仍可查询，失败不覆盖旧快照。

当前源每分钟继续更新并记录真实观察；来源滚动移出已结束赛事时保留曾读到的真实场次，标记 scope=observed 与部分数据，避免把近期窗口误当成整届比赛。新年份按官方目录、赛事 ID 和日期动态发现，不写死 2026 或当前赛季。


## 官方战队图标（2026-10-04）

图标按官方战队 ID 关联，保持官网原图，不以同名搜索结果或手工绘制标志替代。四款游戏当前数据、历史对阵和 ALGS 积分表共用图标组件。

- Riot 当前赛程：公开队伍字段 image / lightImage，图像来自 static.lolesports.com。
- 中国无畏契约：VAL_Game_<ID>.json 的 teamDarkLogo / teamLightLogo；旧存档通过 VAL_Team_<ID>.json 按相同官方 ID 补读，图像来自 esports.val.qq.com。
- 中国英雄联盟：LOL_MATCH2_TEAM_LIST.js 的 TeamLogo / TeamLogoDeep，来源为官网使用的腾讯图片 CDN；协议相对地址与 HTTP 图片地址升级 HTTPS。
- CS2：使用 BLAST 官网页面相同的 assets.blast.tv/images/teams/<官方 UUID> 入口；即使 format 参数与真实格式不同，也按响应实际内容识别 PNG / SVG。
- APEX：EA ALGS /stats/phases/<官方阶段 ID>/standings 的 logoDark / logoLight，图像来自 content.algstools.com；老积分存档仅按完全相同的官方战队 ID 补齐图片，不更新或改写排名、分数。

允许的图片域名固定在 src/logo-sources.js。服务器下载到 assets/team-logo-<来源地址摘要>.<实际格式>，assets/team-logos.json 保存原始图片 URL、关联 ID、下载时间和本地路径。浏览器仅显示本站缓存图片，加载失败或官方未提供图片时显示战队缩写；图标读取失败不会导致赛程读取失败。PWA 缓存用户看过的图片，离线仍可显示。

官网部分白/黑文件名与实际图像颜色相反，因此只改变图标底色：读取原图实际明度，给暗色图案浅色衬底、亮色图案暗色衬底。原图内容不重绘、不染色。
