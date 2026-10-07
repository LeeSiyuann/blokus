# 设计文档（DESIGN）

> 版本：v1.1 ｜ 日期：2026-10-08 ｜ 本文描述实际实现；AI 预留方案见 AI-EXTENSION.md

## 1. 架构与模块

原生 HTML/CSS、Canvas 2D、传统 script；单机兼容 file://。pieces/rules/game/notation 同时导出 window.BK 与 module.exports，浏览器与服务端复用同一规则和状态机。

```
index.html → ui.js（启动器 / 对局 / 历史 / 回放）
                ├─ render.js / replay.js / net.js / storage.js
                ├─ i18n.js / sound.js
                └─ notation.js / game.js → rules.js → pieces.js
server/lan-server.js → game.js / notation.js（REST + SSE + 房间存盘）
scripts/start-lan.js → 服务 main()（地址发现 / 打开浏览器）
```

| 模块 | 主要公开接口（实际名称） |
| --- | --- |
| pieces | PIECES、ALL_PIECE_IDS、orientCells、cellsFor、generateOrientations |
| rules | canPlace、legalPlacements、hasAnyMove、mustPass、allLegalActions、scoreFor、computeResult |
| game | createGame、applyAction、undo、rebuild、replayTo、toJSON、fromJSON、turnInfo |
| notation | toText、parseText、toJSONRecord、fromJSONRecord、summarize |
| storage | getSettings/setSettings、saveRecord/loadRecord、listGames、deleteGame/restoreGame、getCurrent/setCurrent、usageBytes、exportBackup/importBackup、getConnection/setConnection |
| render | Renderer（setState、draw、toCell）、drawPieceThumb、COLORS |
| replay | ReplayPlayer（seek、next、prev、first、last、play、pause、setSpeed、dispose） |
| i18n / sound | t/setLang/getLang/applyI18n；BK.Sound.play/setEnabled/isEnabled/unlock |
| net | NetClient（createRoom/joinRoom/start/restart/leave/kick/move/pass/record/connect/reset） |
| ui | 私有 app 状态和事件绑定；没有公开 BK.App 调度接口 |
| server | createServer({storePath,shareHosts})、main(options)、rooms；CLI --port/--host/--advertise/--selftest |

服务核心只使用 Node 内置 http/crypto/fs/path（URL 使用全局构造器）；os/child_process 只在启动辅助中使用。无运行时 npm 依赖、打包器或二进制资源。

## 2. 领域与数据模型

坐标均为 [row,col]，行向下、列向右，内部 0–19；记谱列 A–T、行 1–20。
每色 21 枚棋子共 89 格，朝向为旋转 0/90/180/270 × 镜像 0/1，枚举时去除重复形状。

| 全局颜色编号 | id | 起始角 |
| --- | --- | --- |
| 0 | blue | [0,0] / A1 |
| 1 | yellow | [0,19] / T1 |
| 2 | red | [19,19] / T20 |
| 3 | green | [19,0] / A20 |

2 人 seatIds=[0,2]、3 人 [0,1,3]、4 人 [0,1,2,3]。board 和 moves.player 使用本局玩家下标，不能把全局颜色编号当玩家下标。
seatIds 支持显式唯一颜色映射并保存到棋谱。联机人数上限与实际开局人数不同：实际加入人数至少 2 人，决定本局 seatIds 和模式标注。

| GameState 字段 | 类型与语义 |
| --- | --- |
| version / rulesVersion | JSON 格式 1；规则 2（缺省导入按旧规则 1） |
| id / mode / status | 安全字符串 id；hotseat/lan；playing/finished |
| createdAt | ISO 日期字符串 |
| startedAt/updatedAt/turnStartedAt/finishedAt | 毫秒时间戳，finishedAt 进行中为 null |
| seatCount/seatIds/players | 2–4 人；全局颜色编号数组；id/name/controller/ai/corner/passed/finished |
| board | 运行时 Int8Array(400)，JSON 为 20×20 数组；-1 空格，其余为本局玩家下标 |
| remaining | 按本局玩家下标排列的棋子 id 数组 |
| turn/consecutivePasses | 当前玩家下标、连续退出动作计数 |
| moves | n/player/type/piece/anchor/rot/mirror/cells/ts/elapsedMs；type 为 place/pass/resign |
| result | scores/bonus/remainingSquares/ ranking/winners/moveCount/durationMs |
| lang/sound/server | 对局附带设置；server 可存 roomId/seat 等元数据，不包含 token |

createGame 生成新局；applyAction 验证后原地修改，并返回 {ok,move} 或 {ok:false,code}。
rebuild/replayTo/fromJSON 从动作顺序重建派生状态。非法动作、错误手号/玩家抛错，不跳过；fromJSON 同时检查提供的 board/remaining/status/turn 是否匹配。
结果与棋子占格由引擎重新计算，不信任外部提供的分数或 cells。JSON 导入保留逐步 ts/elapsedMs 及对局起止时间，避免重新导入改变耗时。

## 3. 规则与模式

1. 首子须覆盖自己的起始角；所有落子不得越界或重叠。
2. 后续至少与同色棋子角接触，不能与同色边接触；异色边/角接触允许。
3. 有合法落子时拒绝 PASS；无合法落子时 PASS 永久退出后续轮次。出完棋子也退出轮次；全部退出则终局。
4. 剩余每格 -1 分，全部出完 +15，最后一枚为 I1 则总计 +20。
5. ranking 按得分排序，winners 包含全部并列最高分；UI 并列名次一致。
6. 单机可撤销最后一步；联网不提供悔棋 API。resign 用于管理离席、跳过合法落子检查并永久退出，不作为正常 PASS。

4 人为标准模式；2/3 人为每人一色、20×20 的简化模式，保留标准落子和计分，未实现官方双人两色/三人共享色变体。
规则来源：https://service.mattel.com/instruction_sheets/R1983-0920.pdf。
旧版 1 保留旧解释器与旧计分，仅在 UI 回放/导出；新局和 LAN 使用规则 2，未知版本拒绝。

## 4. 棋谱协议

### BKS1 文本

```text
BKS1
Rules: 2
Game: g_example
Date: 2026-10-08T00:00:00.000Z
Mode: hotseat
Seats: 0,2
Players: B="Alice Smith" R="Bob"
Moves:
1. B I1 A1 R000 M0
2. R I1 T20 R000 M0
```

字段为「序号. 颜色 棋子 锚点 R旋转 M镜像」，退出为「3. B PASS」或「3. B RESIGN」。
锚点是变换后包围盒的左上原点，不一定被棋子占据。昵称用 JSON 字符串引号/转义，兼容旧式无空格昵称。
Seats 保留颜色映射顺序，缺省时由 Players 的颜色推导；缺省 Rules 按旧规则 1 解释。
文本仅保证着法/座位/昵称/规则往返，不提供逐步计时；上限 512 KiB，手数不超过 players.length*22。

### JSON

单局：{format:'bks-json',version:1,exportedAt,game:GameState}；也兼容裸 GameState。
备份：{format:'blokus-backup',version:1,exportedAt,settings,current,records:[{record,deletedAt}]}。
JSON 保存计时和终局信息；派生字段重建验证，未知扩展字段不承诺逐字保留。界面导入先限制约 12 MiB 文本长度，再校验结构与存储上限。

## 5. 局域网协议与生命周期

| 方法 | 路径 | 参数/返回 |
| --- | --- | --- |
| POST | /api/rooms | name/lang/seatCount → roomId/seat/token/playerId/hostSlot/totalSeats |
| POST | /api/rooms/:id/join | name 或 token；有效 token 恢复原座位，仅大厅允许新身份加入 |
| POST | /api/rooms/:id/start | token；仅房主，至少两人 |
| POST | /api/rooms/:id/restart | token；仅房主且已终局，同房新局或回大厅 |
| POST | /api/rooms/:id/leave | token；释放席位/记录离席 |
| POST | /api/rooms/:id/kick | token/seat；仅房主，不能踢自己 |
| POST | /api/rooms/:id/move | token/piece/anchor/rot/mirror/gameId/expectedMoves |
| POST | /api/rooms/:id/pass | token/gameId/expectedMoves |
| GET | /api/rooms/:id/stream | ?token=；SSE state/removed，20 秒注释心跳，3 秒重试 |
| GET | /api/rooms/:id/record | ?token=；默认 JSON，format=text 返回 BKS1 |
| GET | /api/health | ok/rooms；不含身份 |

state 事件为全量权威状态与大厅/座位数据，按订阅 token 定制 self 下标、online/left；不广播 token。
removed 表示被踢出、主动离席或房间过期。没有独立 move/end/presence、聊天或联网悔棋端点。
客户端在一次请求未完成时禁用重复提交，并携带 gameId/expectedMoves；服务端拒绝不匹配、非当前回合和非法动作。协议兼容旧客户端未带版本字段的请求。
REST 超时为 10 秒；SSE 重连通过原 token 检查席位，全量状态恢复，过期/失效身份返回启动器。

大厅离席会整理 slot，并通过 self 更新客户端；对局中保持 slot 与玩家下标稳定，轮到已离席者时通过共享引擎记录 resign。
房主转移给留下的玩家。至少两位留席可直接再战，仅一位则回大厅；再战会建立新 gameId、按新人数重排颜色。
CLI 默认用临时文件写入后 rename 保存 server/rooms.json；启动时校验恢复游戏和身份，过期房间不加载。
createServer 不传 storePath 则为测试内存服务；同一进程仅管理一套 rooms。服务不是数据库，不提供跨进程并发或服务器磁盘故障恢复保证。
两小时无活动回收，活跃 SSE 心跳维持房间；仅关闭页面不会视为主动弃权。

静态托管白名单仅为 index.html、styles.css 和 js 下直接脚本，不暴露 .git、文档、服务端源码或 rooms.json。
鉴权依赖房间 token，仍定位可信局域网；没有公网账户、HTTPS 部署或访问速率限制。

## 6. 浏览器持久化

| 键 | 内容 |
| --- | --- |
| blokus.settings.v1 | lang/sound/lastSeatCount |
| blokus.current.v1 | 未完成单机局 id（旧局入口转只读回放） |
| blokus.index.v1 | id/时间/模式/规则/玩家/比分/步数/status/deletedAt 摘要 |
| blokus.game.&lt;id&gt; | 单局 bks-json 记录 |
| blokus.connection.v1 | 最近 LAN 的 roomId/token 等身份，不进入备份 |
| sessionStorage blokus.connection | 当前标签页身份，刷新时优先 |

写入先快照、计算变更，再一起更新正文/索引/继续指针；失败尝试回滚，向调用者返回错误，不显示虚假保存成功。
容量以 blokus.* 字符串 UTF-16 字节估算，上限 200 局/4 MiB；可回收最旧终局或回收站记录，正文同步删除，也清理已有孤儿正文。
未结束未删除对局受保护。删除只标记 deletedAt，回收站可恢复；容量清理是真正删除，备份应在清理前完成。
备份导入全部校验后按 id 合并，设置一并恢复；超过容量整体拒绝。连接凭据与普通游戏数据分离，迁移棋谱不迁移身份。

## 7. 界面、回放与音效

ui 私有 app.state 为对局状态，app.replayState 为回放；离开回放暂停，变速重设定时器，避免隐藏回放改变对局。
动态历史、终局、联网状态、提示、标题和错误文案均经中英词条；用户自定义昵称保持原文，默认昵称随语言切换。
人数按钮与 lastSeatCount 同步，切换语言保留用户输入；昵称插入 DOM 使用 textContent 或转义。
Clipboard API 不可用时使用含目标字符串的临时 textarea；失败有提示。棋盘用 pointer 事件，键盘快捷键避开输入框和弹窗。
Sound 用 WebAudio 合成，默认开启、首次用户手势解锁。联机按新动作触发落子/PASS，终局按 gameId 去重，在线状态广播不会重复胜利音效。
存档反馈与网络状态独立展示，掉线/提交中禁用落子，恢复权威状态后清除旧选择。

## 8. 验证与扩展

npm run test:all 包含 673 项单元、服务自检、22 项服务可靠性、44 项单机浏览器、28 项联机浏览器；证据及适用边界见 IMPLEMENTATION 和 REQUIREMENTS。
合法着法枚举目前遍历朝向与棋盘，角点候选优化、更多设备无障碍/触控验证和 UI 模块拆分属于后续改善。
AI 可复用 allLegalActions/createGame/applyAction/rebuild；注册表、只读上下文构建、异步调度器尚未实现，R12 验收为设计与参数文档。
