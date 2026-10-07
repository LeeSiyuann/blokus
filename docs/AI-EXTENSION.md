# AI 扩展与二次开发接口（AI-EXTENSION）

> 版本：v1.0 ｜ 日期：2026-10-06 ｜ 状态：顶层设计已定稿，AI 实现留待后续
> 本文档是 AI 对手的**唯一接口契约**。实现 AI 时不得修改 `game.js` 的公开行为，只能通过这里定义的挂载点接入。

## 1. 顶层设计

### 1.1 设计原则

1. **人类与 AI 走同一条通道**：AI 产出的 `Action` 与人类点击产生的 `Action` 完全同构，都经 `game.applyAction()` 校验，
   因此 AI 对局天然可存档、可回放、可导出棋谱。
2. **只读上下文**：AI 拿到的是 `ctx` 只读快照（含合法着法枚举器），不能直接改状态；保证引擎单点事实来源。
3. **可复现**：`options.seed` 注入确定性随机源，同一 seed + 同一对局 → 同一落子序列。
4. **异步友好**：`onTurn` 返回 Promise，允许"思考延时"、Web Worker、远程推理等实现，UI 只需 await。
5. **性能隔离**：重搜索类 AI 建议在 Web Worker 中运行；主线程接口不变（`options.workerUrl`）。

### 1.2 运行位置与调用时序

```
ui.js 轮询到 currentPlayer.controller === 'ai'
   └─ AIController.onTurn(ctx)            // ctx 只读，含合法着法枚举器
        └─ 返回 Action { type:'place', piece, anchor, rot, mirror } | { type:'pass' }
             └─ game.applyAction(state, action)   // 与人类同一校验通道
                  ├─ 合法 → 入 moves[]、存档、渲染、音效
                  └─ 非法 → console.warn + 回退到 safeAction()（见 3.3）
```

### 1.3 目录约定（预留）

```
js/ai/index.js        AI 注册表（把 controller 名称映射到实现）
js/ai/random.js       随机合法着法（基线，约 40 行）
js/ai/greedy.js       贪心启发式（角点/机动性/面积）
js/ai/worker.js       Web Worker 入口（可选）
```
未实现前 `js/ai/` 目录可不存在；`game.js` 只依赖下方契约，不依赖具体文件。

当前规则版本为 2：同色必须角接触且不得边接触，异色接触不限；全出完 +15，I1 收尾总计 +20。
2/3 人为每人一色的简化模式；AI 应使用 state.seatCount / players，不假设始终有四个席位。
旧规则版本 1 仅供历史回放，不应挂载 AI 继续对局；ctx 和控制器注册表仍属于预留接口。

## 2. 接口一览

| 接口 | 形态 | 用途 | 状态 |
| --- | --- | --- | --- |
| BK.AI.register(id, factory) | 函数 | 注册一个 AI 控制器工厂 | 预留 |
| BK.AI.create(id, options) | 函数 → AIController | 创建控制器实例 | 预留 |
| BK.AI.list() | 函数 → string[] | 列出可用 AI | 预留 |
| AIController.onTurn(ctx) | 方法 → Promise&lt;Action&gt; | 轮到该 AI 时调用 | 预留 |
| AIController.onGameEnd(result) | 方法 → void | 终局通知，可自我评估 | 预留 |
| AIController.dispose() | 方法 → void | 释放资源（Worker/定时器） | 预留 |
| BK.allLegalActions(state, playerIndex) | 函数 → Action[] | 合法着法枚举（含 pass） | v1 提供 |
| BK.evaluateBoard(state, playerIndex) | 函数 → number | 基础局面评估（留给 AI 覆盖） | 预留 |

## 3. 参数列表

### 3.1 `BK.AI.create(id, options)`

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| id | string | 是 | — | 控制器标识：`random` / `greedy` / `minimax` / 自定义 |
| options.seed | number | 否 | 当前时间戳 | 随机种子；用于可复现 |
| options.difficulty | 1–5 | 否 | 3 | 抽象难度，由实现自行解释 |
| options.timeLimitMs | number | 否 | 1000 | 单步思考上限（毫秒） |
| options.maxDepth | number | 否 | 2 | 搜索深度（搜索类 AI） |
| options.workerUrl | string | 否 | null | 若提供则在 Web Worker 内运行 |
| options.personality | object | 否 | {} | 自由配置（进攻/防守权重等），实现自定义 |
| options.log | (level, message) =&gt; void | 否 | console | 诊断日志回调 |

返回：`AIController`（见 3.2）。若 id 未注册，`create` 抛出 `AI_NOT_FOUND` 并在 UI 显示可读错误。

### 3.2 `AIController`

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 控制器标识 |
| displayName | string | UI 展示名（支持 `{zh, en}` 结构） |
| onTurn(ctx) | (ctx) =&gt; Promise&lt;Action&gt; | 轮到该 AI 决策；超时由实现内部处理，UI 不强制中断 |
| onGameEnd(result) | (result) =&gt; void | 终局回调，可用于记录统计 |
| dispose() | () =&gt; void | 释放资源；对局结束或离开页面时调用 |

### 3.3 `ctx`（只读上下文）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| board | Int8Array(400) 只读视图 | 值 = 玩家下标或 -1；索引 = row * 20 + col |
| playerIndex | number | 当前 AI 的玩家下标 0–3 |
| playerId | string | `blue` / `yellow` / `red` / `green` |
| remaining | string[][] 只读副本 | 每名玩家剩余棋子 id |
| moveHistory | MoveRecord[] 只读副本 | 完整走子历史（含耗时） |
| turnNumber | number | 当前是全局第几手（从 1 计） |
| legalActions() | () =&gt; Action[] | 惰性枚举全部合法着法（含 `pass`）；结果被缓存 |
| hasAnyMove() | () =&gt; boolean | 是否存在非 pass 的合法着法 |
| corner | [row, col] | 自己的起始角 |
| scores | () =&gt; number[] | 当前预估分数（实时计算） |
| clone() | () =&gt; ctx | 深拷贝，用于搜索演练（不影响真实状态） |
| isTerminal() | () =&gt; boolean | 是否终局 |
| seedRandom | () =&gt; number | [0,1) 确定性随机数 |

### 3.4 `Action`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| type | 'place' \| 'pass' | 是 | 走子类型 |
| piece | string | place 时必填 | 棋子 id，如 `F5` |
| anchor | [row, col] | place 时必填 | 锚点（棋子最小行列格），0–19 |
| rot | 0 \| 90 \| 180 \| 270 | 否 | 默认 0 |
| mirror | 0 \| 1 | 否 | 默认 0，是否镜像 |
| reason | string | 否 | 诊断用：AI 决策理由（会写入对局日志，不入棋谱） |

### 3.5 `result`（终局）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| scores | { [playerId]: number } | 各玩家得分 |
| ranking | string[] | 玩家 id，按名次排序 |
| bonus | { [playerId]: 0 \| 15 \| 20 } | 完成奖励 |
| remainingSquares | { [playerId]: number } | 剩余格数 |
| moveCount | number | 总手数 |
| durationMs | number | 对局时长 |

## 4. 配置协议（存档与 UI）

对局存档中 AI 玩家记录如下结构（`players[i]`）：

```json
{
  "id": "yellow",
  "name": "AI-1",
  "controller": "ai",
  "ai": {
    "id": "greedy",
    "difficulty": 3,
    "seed": 20261006,
    "timeLimitMs": 1000,
    "maxDepth": 2,
    "personality": { "attack": 0.4, "defense": 0.6 }
  },
  "corner": [0, 19],
  "passed": false,
  "finished": false
}
```

导入对局时若 `ai.id` 未注册：降级为人类玩家并提示，不阻断回放。

## 5. 复现与环境要求

- 同一 `seed` + 同一 `options` + 同一引擎版本 → 必须产生相同着法序列；实现中禁止使用 `Math.random()`，改用 `ctx.seedRandom()`。
- AI 不得读取 DOM、时钟以外的环境信息；`timeLimitMs` 是唯一允许的时间敏感输入（其结果允许因计时波动不同，此时应把实际用时应写入 `Action.reason`）。
- Web Worker 实现需通过 `options.workerUrl` 注入，主线程接口保持不变。

## 6. 测试要求（AI 实现时）

| 测试 | 内容 |
| --- | --- |
| 确定性 | 同 seed 两次运行，着法序列完全一致 |
| 合法性 | 1000 局随机对局中 AI 着法全部通过 `game.applyAction` 校验 |
| 终止性 | 每步在 `timeLimitMs * 1.5` 内返回；无死循环 |
| 回放一致性 | AI 对局导出棋谱后重新导入，回放结果与原局一致 |
| 性能 | 4×AI 对局完整跑完 &lt; 3 分钟（难度 3、单步 1s 上限） |

## 7. 后续路线图（建议）

1. `random`：随机合法着法（基线、验证通道）；
2. `greedy`：启发式（优先角点扩展、保留大块、压缩对手空间）；
3. `minimax + alpha-beta`：2–4 层搜索 + 走法排序 + 置换表；
4. `MCTS`：蒙特卡洛树搜索（时间预算控制）；
5. 学习类：策略网络 / 自我对局（需要训练管线，独立仓库）。

