# 设计文档（DESIGN）

> 版本：v1.0 ｜ 日期：2026-10-06 ｜ 对应实现：js/*、server/lan-server.js

## 1. 总体架构

```
浏览器（单页三视图） index.html
   ├─ Launcher 视图（启动器）：单机 / 局域网 / 继续 / 历史 / 导入 / 设置
   ├─ Game 视图（对局）：Canvas 棋盘 + 棋子托盘 + 计分板 + 控制条
   └─ Replay 视图（回放）：棋盘 + 步进/播放/跳转控件

ui.js ── 视图路由与事件总线
   ├─ render.js   画布渲染（棋盘、预览、高亮、最近一手）
   ├─ game.js     对局状态机（唯一状态源，纯逻辑，双端复用）
   ├─ rules.js    规则判定 / 落点枚举 / 计分
   ├─ pieces.js   21 种棋子 + 朝向集合
   ├─ notation.js 棋谱编解码（BKS1 / JSON）
   ├─ storage.js  localStorage 持久化
   ├─ replay.js   回放播放器（由 moves[] 重建任意步状态）
   ├─ i18n.js     中英文词条与切换
   ├─ sound.js    WebAudio 合成音效
   └─ net.js      局域网客户端（REST 提交 + SSE 订阅）

server/lan-server.js（Node 内置模块，零依赖）
   ├─ 静态资源托管（/、/js/*、/styles.css）
   ├─ 房间管理：创建 / 加入 / 重连（playerToken）/ 过期回收
   ├─ 状态广播：GET /api/rooms/:id/stream（SSE：state / move / end / presence）
   └─ 裁判：轮次校验 + 共享 rules.js 复核 + 记录 moves[]
```

## 2. 模块职责与依赖方向

依赖只能自上而下：ui.js → (render / replay / net / storage) → game.js → rules.js → pieces.js。
notation.js、i18n.js、sound.js 为工具层，可被任意层调用，但不反向依赖 UI。

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| js/pieces.js | 21 种棋子的标准形状、朝向枚举、格子变换 | PIECES、ORIENTATIONS、orientCells() |
| js/rules.js | 纯规则判定：可放性、首子、邻接约束、pass 判断、计分 | canPlace()、hasAnyMove()、legalAnchors()、score() |
| js/game.js | 对局状态机：创建、落子、pass、悔棋、结束、序列化 | createGame()、applyMove()、undo()、toJSON()、fromJSON() |
| js/notation.js | BKS1 文本棋谱与 JSON 编解码，坐标/朝向转换 | toText()、parseText()、toJSONRecord()、fromJSONRecord() |
| js/storage.js | 设置、当前对局、历史索引、对局正文读写与容量管理 | saveGame()、loadGame()、listGames()、setSetting() |
| js/render.js | Canvas 绘制：棋盘、棋子、预览、最近一步、提示 | Renderer（draw()、setState()、hitTest()） |
| js/replay.js | 回放状态机：步进、播放、跳转、速度 | ReplayPlayer |
| js/i18n.js | 词条表 + 切换 + DOM 扫描 | t()、setLang()、applyI18n() |
| js/sound.js | WebAudio 合成音效与开关 | Sound.play()、Sound.setEnabled() |
| js/net.js | 局域网客户端：建房/加入、提交、SSE 订阅、重连 | NetClient |
| js/ui.js | 视图路由、事件绑定、对局驱动、启动器逻辑 | App（start()、showView()） |
| server/lan-server.js | 静态托管、房间、裁判与广播 | CLI：--port、--open、--selftest |

## 3. 领域模型

### 3.1 玩家与颜色

| 顺序 | id | 颜色 | 起始角（列,行） | 说明 |
| --- | --- | --- | --- | --- |
| 0 | blue | 蓝 | A1（左上） | 默认第一名 |
| 1 | yellow | 黄 | T1（右上） | |
| 2 | red | 红 | T20（右下） | |
| 3 | green | 绿 | A20（左下） | |

坐标系：列 A–T 从左到右（0–19），行 1–20 从上到下（0–19），单元格记法 A1…T20。
2 人简化模式采用蓝（A1）对红（T20）；3 人简化模式采用蓝、黄、绿；4 人标准模式使用全部颜色。
简化模式每人一色、棋盘仍为 20×20，使用标准落子和计分约束，不实现官方双人两色/三人共享色变体。
局域网座位按加入顺序占位，房主选择的是人数上限；实际开局人数为已加入人数（至少 2 人）。模式标签按实际对局人数确定。

### 3.2 棋子集（21 块，每色一套）

单格 1、二连 1、三连 2、四连 5、五连 12，合计 21 块 / 89 格。
标识采用标准多联骨牌命名：I1 I2 I3 L3 I4 O4 T4 L4 S4 F5 I5 L5 N5 P5 T5 U5 V5 W5 X5 Y5 Z5。
每块预计算旋转 0/90/180/270 × 镜像 0/1 的朝向并去重，供 UI 轮换与服务端校验。

### 3.3 GameState（JSON）

```json
{
  "version": 1,
  "rulesVersion": 2,
  "id": "g_20261006_ab12cd",
  "createdAt": "2026-10-06T12:00:00.000Z",
  "updatedAt": "2026-10-06T12:30:00.000Z",
  "status": "playing",
  "mode": "hotseat",
  "lang": "zh",
  "sound": true,
  "players": [
    { "id": "blue", "name": "玩家1", "controller": "human", "corner": [0, 0], "passed": false, "finished": false }
  ],
  "turn": 0,
  "consecutivePasses": 0,
  "board": [[-1]],
  "remaining": [["I1", "I2"], []],
  "moves": [
    {
      "n": 1, "player": 0, "type": "place",
      "piece": "F5", "anchor": [4, 4],
      "rot": 90, "mirror": 0,
      "cells": [[5, 4], [6, 4]],
      "ts": 1759700000000, "elapsedMs": 12000
    }
  ],
  "result": null,
  "server": null
}
```

说明：status = playing | finished；mode = hotseat | lan；controller = human | ai | remote；
moves[].type = place | pass；board 为 20×20 扁平化后序列化的二维数组，值 = 玩家下标或 -1；
server 仅 lan 模式使用，形如 { roomId, seat, host }。

board 与 remaining 属于可重建派生数据：导入/回放时先由 moves[] 重放生成，保证一致性；
存档时写入派生快照以加速加载并做一致性校验（不一致时以 moves[] 为准并记录告警）。

## 4. 规则规格（判定顺序）

1. 越界或重叠 → 非法。
2. 首子：必须覆盖自己起始角单元格（corner）；允许接触异色棋子。
3. 后续子：
   - 必须至少与本方已有棋子角相邻（对角）；
   - 不得与任何本方已有棋子边相邻（即使同时角接触也非法）；
   - 异色棋子之间允许边接触或角接触。
4. 无合法着法时可 PASS 并退出后续轮次；全部玩家均已 PASS 或出完棋子时终局。
5. 计分：score = -(剩余格数)；出完全部 21 块 +15；若最后放置的是单格 I1，额外 +5（共 +20）。
6. 悔棋（仅本地模式）：撤销最后一步并回滚状态；联网模式默认禁用。

实现要点：rules.js 使用 20×20 扁平数组加速邻接检查；legalPlacements() 遍历去重朝向与棋盘锚点，通过 canPlace() 判定；候选角点枚举属于后续性能优化。

规则依据：https://service.mattel.com/instruction_sheets/R1983-0920.pdf。

### 4.1 旧棋谱隔离

GameState.rulesVersion 独立于 JSON 格式 version：新局默认为 2；导入或重建时缺省按旧版 1 解释；未知版本拒绝。
版本 1 仅用于保留历史回放：原同色边接触、禁止异色边接触和反向奖励均保留，不用于新单机或联机局。
UI 将旧记录的继续/历史/导入入口统一转为只读回放；导出明确写回规则版本。离开自动回放时暂停，隐藏回放不再写入对局状态。
历史索引也记录 rulesVersion。2/3/4 人标签在设置、对局、历史和回放显示并支持中英文切换。

## 5. 记谱规格（BKS1）

### 5.1 文本格式

```
BKS1
Rules: 2
Game: g_20261006_ab12cd
Date: 2026-10-06T12:00:00.000Z
Mode: hotseat
Players: B=玩家1 Y=玩家2 R=玩家3 G=玩家4
Moves:
1. B I1 A1 R000 M0
2. Y I1 T1 R000 M0
3. R I1 T20 R000 M0
4. G I1 A20 R000 M0
5. B I2 B2 R000 M0
```

字段：序号. 玩家(B/Y/R/G) 棋子名 锚点(列字母+行号) R{旋转角度} M{0/1 镜像}；PASS 表示停一手。
锚点定义为该棋子**包围盒左上角**（棋子基准网格原点，即最小行、最小列对应的位置；对 S4/Z5/N5 等形状该格可能不被占据）。
配合 R/M 可唯一复现任意落子，导出与导入使用同一约定（往返一致性由 tests/run-all.js 覆盖）。

### 5.2 JSON 格式

{ "format": "bks-json", "version": 1, "game": { ...GameState... }, "moves": [...], "result": {...} }
JSON 为无损格式：导入后 100% 还原对局与回放。

## 6. 局域网协议

### 6.1 端点

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| POST | /api/rooms | 创建房间 | { name, lang, seatCount } → { roomId, seat, token } |
| POST | /api/rooms/:id/join | 加入/重连房间 | { name, seat?, token? } → { seat, token, state } |
| GET | /api/rooms/:id/stream | SSE 订阅 | ?token=，事件：state / move / end / presence |
| POST | /api/rooms/:id/move | 提交走子 | { token, type, piece, anchor, rot, mirror, clientSeq } |
| POST | /api/rooms/:id/pass | 停一手 | { token } |
| POST | /api/rooms/:id/undo | 悔棋（默认关闭） | { token, targetMove } |
| POST | /api/rooms/:id/chat | 快捷表情（可选） | { token, emoji } |
| GET | /api/rooms/:id/record | 导出棋谱 | 返回 BKS1 或 JSON |
| GET | /api/health | 健康检查 | → { ok, rooms, uptime } |

### 6.2 事件与一致性

- 所有写操作服务端权威：校验 token → 校验轮次 → 用共享 rules.js 复核 → 更新状态 → 广播。
- 每个 move 携带 clientSeq（客户端单调递增），服务端回显 serverSeq，客户端据此丢弃乱序事件。
- 断线重连：客户端持 token 调 /join 恢复座位并全量拉取状态（state 事件含完整 GameState）。
- 房间默认 2 小时无活动回收；server/rooms.json 仅用于可选持久化，默认不写盘。

## 7. 持久化设计

| 键 | 内容 | 说明 |
| --- | --- | --- |
| blokus.settings.v1 | { lang, sound, theme, lastSeatCount } | 用户设置 |
| blokus.current.v1 | 当前进行中对局 id | 启动器"继续"入口 |
| blokus.index.v1 | 历史索引数组（id/时间/模式/玩家/比分/步数） | 历史列表数据源 |
| blokus.game.&lt;id&gt; | 完整 GameState JSON | 单局正文 |
| blokus.migrate | 数据版本 | 迁移标记 |

容量策略：index 超过 200 局或占用超过 4 MB 时提示导出并清理最旧记录；删除为软删除（标记 deletedAt），可一键恢复。

## 8. 界面设计

### 8.1 视图与路由

单页三视图：launcher（启动器）→ game（对局）→ replay（回放），由 ui.js 切换 body[data-view] 与 CSS 过渡。

### 8.2 启动器（首屏）

```
┌───────────────────────────────────────────────┐
│  角斗士棋 BLOKUS            [中文|EN]  🔊 音效 │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 单机热座 │  │ 局域网   │  │ 继续对局 │     │
│  │ 2–4 人   │  │ 联机大厅 │  │ 上一局   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│  ┌──────────┐  ┌──────────┐                   │
│  │ 历史对局 │  │ 导入棋谱 │                   │
│  └──────────┘  └──────────┘                   │
│  提示：file:// 打开时禁用局域网入口并给出指引  │
└───────────────────────────────────────────────┘
```

### 8.3 对局界面

左侧 Canvas 棋盘（坐标、最近一手高亮、合法/非法预览）；右侧信息面板：当前玩家、计时、四色计分（剩余块与剩余格）、
棋子托盘（R/F 旋转翻转）、按钮（确认落子、PASS、悔棋、导出、返回）。

### 8.4 回放界面

顶部：对局信息与结果；中部：只读棋盘；底部控件：上一步 / 播放暂停 / 下一步 / 速度（0.5× 1× 2× 4×）/ 步号跳转 / 进度条；
右侧：当前步详情（玩家、棋子、锚点、旋转、耗时）与实时比分。

## 9. 国际化与音效

- 词条 key 采用 view.section.item 命名；缺失时回退英文并 console.warn（开发期暴露）。
- 所有可见文案必须走 t() 或 data-i18n，禁止硬编码中文。
- 音效：place（落子）、invalid（非法）、select（选中）、pass（停手）、win（终局）。
  使用 WebAudio 合成（振荡器 + 包络），首次用户手势时创建 AudioContext；默认开启，可在启动器与对局内关闭。

## 10. 兼容与安全

- 目标浏览器：Chrome / Edge / Firefox 近两年版本；file:// 下除联网外全部功能可用。
- 服务端默认监听 0.0.0.0，无账户体系，仅靠房间码 + token；文档明确"仅限可信局域网使用"。
- 前端对导入的 JSON/文本做结构校验与范围限制（棋盘 20×20、moves 上限 5000），防止恶意数据导致卡死。

## 11. 验证体系（实际实现）

| 层级 | 工具 | 覆盖 |
| --- | --- | --- |
| 单元测试 | Node（零依赖）tests/run-all.js | 棋子集/朝向、全部规则分支、随机整局模拟、序列化、悔棋与回放一致性、棋谱往返（含独立规则局面、旧版本回归） |
| 服务端自检 | node server/lan-server.js --port 18345 --selftest | 建房/加入/开局/轮次强制/合法性/起始角规则 |
| 浏览器冒烟 | tests/browser-smoke.js（Chrome DevTools Protocol） | 启动器、i18n、音效开关、单机落子、非法落子拦截、存档、导出、历史、继续对局、回放（35 项） |
| 联机端到端 | tests/browser-lan-smoke.js | 建房/加入/大厅/开局/双向实时同步/轮次锁定（含简化模式标签） |

说明：两个浏览器测试要求本机有 Chrome/Edge，并且需要允许启动浏览器进程；测试截图输出到 output/playwright/（已加入 .gitignore）。

## 12. AI 预留设计（摘要）

详见 docs/AI-EXTENSION.md。核心约定：

- 玩家 controller 字段支持 human | ai | remote，状态机与 UI 不区分具体实现；
- 引擎暴露 BK.AI 契约：createController(options) 返回 { onTurn(ctx) -> Promise<Action>, onGameEnd(result), dispose() }；
- 上下文 ctx 为只读视图（棋盘、剩余棋子、历史、合法着法枚举器）；
- AI 决策走 Action 协议（与人类落子同一校验通道），保证可回放、可导出、可复现（含 seed）。

