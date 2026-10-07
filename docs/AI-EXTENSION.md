# AI 扩展与二次开发接口（AI-EXTENSION）

> 版本：v1.1 ｜ 日期：2026-10-08 ｜ R12：预留设计与参数文档；当前不实现 AI 对手

## 1. 已实现与预留的边界

当前已提供共享规则、合法着法枚举、对局创建/动作校验、克隆重建和序列化。players.controller/ai 元数据可保存，但 UI 没有 AI 调度，所有现有席位仍由用户操作。
BK.AI 注册表、ctx 构建器、AI 实现、Worker 入口及未注册 AI 的降级提示都属于后续方案，不能在当前版本直接调用。
旧规则版本 1 只供回放，AI 不得继续旧局。2/3 人为每人一色的简化模式，不能假定每局有四名玩家；本局玩家下标和全局颜色编号也不能混用。

| 接口 | 状态 | 实际调用/用途 |
| --- | --- | --- |
| BK.createGame(options) | 已实现 | 创建规则 2 的新局 |
| BK.allLegalActions(state,playerIndex,limit?) | 已实现 | 合法 place 动作列表；无合法着法时给 pass，调用方须先检查状态/玩家是否仍可行动 |
| BK.hasAnyMove / mustPass | 已实现 | 判断合法落子与 PASS |
| BK.applyAction(state,action,options?) | 已实现 | 唯一动作校验通道；原地修改 state，返回 ok/code/move |
| BK.toJSON/fromJSON/rebuild/replayTo | 已实现 | JSON 快照、严格还原、搜索演练与回放 |
| BK.scoreFor/computeResult | 已实现 | 剩余面积、标准奖励、并列结果 |
| BK.AI.register/create/list | 预留 | 控制器工厂注册表 |
| AIController.onTurn/onGameEnd/dispose | 预留 | 异步决策、终局通知、资源回收 |
| ctx / BK.evaluateBoard | 预留 | 只读上下文与启发式评估 |

Node 对应 require('../js/game.js')、require('../js/rules.js') 等模块；浏览器全部位于 window.BK。

## 2. 底层实际参数

### createGame(options)

| 参数 | 类型 | 默认/说明 |
| --- | --- | --- |
| seatCount | 2/3/4 | 默认 4；有 seatIds 时必须与其长度一致 |
| seatIds | number[] | 默认 SEATS[seatCount]；全局颜色编号 0–3，2–4 个唯一编号，可自定义顺序 |
| players | object[] | 按本局顺序；name/controller/ai；controller 默认 human，ai 默认 null |
| mode | hotseat/lan | 默认 hotseat |
| rulesVersion | number | 新局默认 2；1 仅历史解释 |
| id/createdAt/startedAt | string/string/number | 可注入标识、ISO 日期、毫秒起点，测试/重建用 |
| lang/sound/server | string/boolean/object | zh/true/null；附带元数据 |

### applyAction(state,action,options)

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| state | GameState | 修改原对象；搜索必须先克隆 |
| action.type | place/pass/resign | AI 正常决策只使用 place/pass；resign 专供管理离席/明确弃权 |
| action.piece | string | place 必填，如 F5 |
| action.anchor | [row,col] | place 必填；整数；变换后包围盒左上原点，不一定占格 |
| action.rot | 0/90/180/270 | 默认 0 |
| action.mirror | 0/1 或 boolean | 默认 0，记录规范化为 0/1 |
| action.player/action.n | number | 可选一致性检查，若有必须匹配当前玩家和下一手号 |
| action.reason | string | 可选，最多保存 200 字符到 JSON move；文本棋谱不保存 |
| options.ts/options.elapsedMs | number | 非负有限毫秒数；默认当前时间/本回合经过时间，重建保留原值 |
| options.validate | boolean | 默认 true；false 仅跳过 PASS 的 hasAnyMove 检查，落子仍校验；正常 AI 不应使用 |

失败返回 {ok:false,code}，不改变状态；成功为 {ok:true,move}。联网正常决策只能提交 /move 或 /pass，仍由服务端裁判。

终局 result：scores/bonus/remainingSquares 按玩家 id 映射；ranking 为排序 id 数组，winners 为所有最高分 id；moveCount 为总手数，durationMs 为结束减开始时间。
规则 2 的奖励为 15/20；旧规则 1 保留旧计分。并列不得只取 ranking[0] 显示为唯一赢家。

## 3. 后续控制器契约（尚未实现）

### 注册与创建

BK.AI.register(id,factory)、create(id,options)、list()；factory(options) 返回 AIController。
计划由 create 对未知 id 抛出 AI_NOT_FOUND，由未来 UI 提示或降级人类席位，不阻断历史回放。

| options 参数 | 类型 | 默认 | 用途 |
| --- | --- | --- | --- |
| seed | number | 创建时固定的种子 | 复现决策，写入玩家 ai 配置 |
| difficulty | 1–5 | 3 | 抽象难度 |
| timeLimitMs | number | 1000 | 思考预算，由调度器管理超时 |
| maxDepth | number | 2 | 搜索深度 |
| workerUrl | string/null | null | 重搜索 Worker 地址，兼容传统脚本加载 |
| personality | object | {} | 启发式权重 |
| log | function | console 回调 | 诊断信息，不记录私人连接身份 |

| AIController 成员 | 类型 | 用途 |
| --- | --- | --- |
| id/displayName | string / string 或 {zh,en} | 身份与界面名 |
| onTurn(ctx) | Promise<Action> | 异步决定一个合法 place/pass |
| onGameEnd(result) | void | 终局通知 |
| dispose() | void | 清理 Worker、请求和计时器 |

### ctx 参数（未来构建器）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| board | Int8Array(400) 副本 | 不直接传引擎数组；row*20+col，值为本局玩家下标/-1 |
| playerIndex/playerId | number/string | 本局下标与颜色 id |
| seatCount/seatIds/rulesVersion | number/number[]/number | 实际人数、颜色顺序与规则版本 |
| remaining/moveHistory | 深复制数组 | 剩余棋子与着法，不允许写回真实状态 |
| turnNumber/corner | number/[row,col] | 下一手号与起始角 |
| legalActions()/hasAnyMove() | Action[]/boolean | 惰性、缓存的合法着法与检查 |
| scores()/isTerminal() | number[]/boolean | 当前得分与终局 |
| clone() | ctx | 独立搜索副本 |
| seedRandom() | number | [0,1) 确定性随机数 |

只读需由未来适配器保证隔离：TypedArray 本身不是不可变对象，应提供副本或访问器。不能把内部 state/board 引用传给控制器。

## 4. 挂载点与调用时序（未来实施）

```
ui.js / 未来控制器调度器：观察 state.turn 和 players[turn].controller
  → 构造深复制 ctx，记录 gameId + moves.length
  → AIController.onTurn(ctx)
  → 确认仍是同局同回合；已悔棋/换局/离开则丢弃迟到结果
  → 单机 applyAction；联机 NetClient.move/pass（保留服务端权威）
  → 成功后保存/渲染/音效；失败或超时选择安全合法动作
终局/离开 → onGameEnd、dispose，清理调度与 Worker
```

这些步骤尚未写入 ui.js；必须在实现 AI 时新增调度层，不能只给玩家写 controller='ai' 就认为完成。
建议目录 js/ai/index.js、random.js、greedy.js、worker.js，目前可以不存在。
现有脚本都是非 ES Module，新增 AI 也应保持 file:// 单机可运行；更重的 Worker 支持应独立检测环境并提供降级。

玩家配置片段（可被现有序列化保存，暂不会执行）：

```json
{
  "name": "AI-1",
  "controller": "ai",
  "ai": {"id": "greedy", "seed": 20261008, "difficulty": 3, "timeLimitMs": 1000, "maxDepth": 2}
}
```

## 5. 实现时验证

- 同 seed/options/引擎版本的着法序列一致，决策中避免 Math.random；预算计时可能有差异时保存实际着法和用时。
- 全部 AI 动作通过共享 applyAction；只有无合法落子才 PASS。
- 2/3/4 人与自定义颜色顺序均可终局；旧规则只回放，不参与新 AI 对局。
- JSON/BKS1 往返一致，JSON 保持 elapsedMs/终局时间与并列结果。
- 超时、非法返回、Worker 出错、悔棋/换局后的迟到结果可恢复；离开页面无残留定时器。

可按随机合法基线 → 贪心 → 搜索/MCTS 逐步实现；候选角点枚举和 Worker 性能优化应先测量，再扩展。
