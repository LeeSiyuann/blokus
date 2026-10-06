# 操作日志（LOG）

> 规则：每次操作（功能/修复/文档/版本）完成后追加一条，包含时间、操作、文件、验证、提交、遗留。
> 同日流水另存于 logs/YYYY-MM-DD.md。

## 2026-10-06

### OP-001 仓库与规范初始化

- 时间：2026-10-06
- 操作：git init（main）；建立目录骨架；编写 AGENTS.md（协作规范/需求基线/流程）；编写 README.md、docs/PLAN.md、docs/DESIGN.md、docs/AI-EXTENSION.md、docs/IMPLEMENTATION.md、docs/LOG.md、docs/plan/PLAN.json
- 验证：git status 检查文件齐全
- 提交：b08b804
- 遗留：无（M0 完成）

### OP-002 M1 规则引擎

- 时间：2026-10-06 ~ 2026-10-07
- 操作：实现 js/pieces.js（21 种棋子 + 朝向去重）、js/rules.js（越界/重叠/起始角/边邻接/角接触/pass/计分）、js/game.js（对局状态机、undo、rebuild、replayTo、JSON 序列化）、js/notation.js（BKS1 文本与 JSON 棋谱编解码）、tests/run-all.js（零依赖测试）
- 验证：node tests/run-all.js → 通过 491 项，失败 0 项（含随机整局模拟、回放/悔棋一致性、棋谱往返）
- 提交：6a701d8
- 遗留：无（M1 完成）

### OP-003 M2+M3 启动器 / 单机对局 / 存档 / i18n / 音效

- 时间：2026-10-07
- 操作：index.html 三视图单页（启动器 / 对局 / 回放）与 styles.css 深色主题 + 四色配色；js/i18n.js 中英词条与切换；js/sound.js WebAudio 合成音效（默认开启，可关闭并持久化）；js/storage.js localStorage 存档、历史索引与容量统计；js/render.js Canvas 棋盘渲染（坐标、起始角、最近一手、合法/非法预览、棋子缩略图）；js/ui.js 界面总控（2/3/4 人热座、选子、R/F 旋转翻转、点击落子、PASS 提示、悔棋、终局计分弹窗、自动存档）
- 验证：node tests/run-all.js 491/491；node tests/browser-smoke.js 25/25（含非法落子拦截、存档写入、继续对局）
- 提交：d5227b6
- 遗留：无

### OP-004 M4+M5 历史回放与棋谱导入导出

- 时间：2026-10-07
- 操作：js/replay.js 回放播放器（首/末/前/后/自动播放/0.5–4× 速度/进度条跳转）；历史列表（时间、模式、玩家、比分、步数、软删除）；BKS1 文本棋谱与无损 JSON 的导出、复制、下载、导入还原；导出弹窗支持两种格式
- 验证：浏览器冒烟中"回放步数与对局一致（71 步）/可步进"通过；棋谱 BKS1 往返与 JSON 往返在单元测试中通过
- 提交：d5227b6
- 遗留：无

### OP-005 M6 局域网联机

- 时间：2026-10-07
- 操作：server/lan-server.js（零依赖静态托管 + 房间码 + playerToken + 服务端裁判 + SSE 广播 + 2 小时回收 + --selftest）；js/net.js 客户端（REST + EventSource 自动重连）；大厅界面（房间码/链接/座位/房主开始）；launcher.cmd 与 scripts/start-lan.sh 一键启动
- 验证：server --selftest OK；tests/browser-lan-smoke.js 18/18（建房、加入、满员开始、双端实时同步、轮次锁定、非当前回合无法落子）
- 提交：d5227b6
- 遗留：跨网段/NAT 场景不支持（文档已说明）

### OP-006 M7 打磨与文档同步

- 时间：2026-10-07
- 操作：README 增加联机说明与验证命令；docs/DESIGN.md 澄清棋谱锚点定义（包围盒左上角）、补充局域网座位映射与"验证体系"章节；docs/IMPLEMENTATION.md 补充测试命令、全量验证结果与版本表；docs/PLAN.md 里程碑与验收清单更新为完成态；AGENTS.md 升级 v1.1（新增 MCP 清单与远程仓库/PR 约定）；package.json 提供 test/test:lan/lan 等脚本
- 验证：文档逐条对照实现核对；全部测试命令按文档执行通过
- 提交：b890501
- 遗留：M8（GitHub 远程仓库）等待用户一次性授权

### OP-007 记录 M2–M7 提交哈希

- 时间：2026-10-07
- 操作：将 OP-003–OP-006 的实现提交 d5227b6 与文档提交哈希写入日志与 docs/plan/PLAN.json，M2–M7 置为 done
- 验证：git log 与 PLAN.json 对照
- 提交：b890501（本文件随该提交入库）
- 遗留：M8 待授权

### OP-008 GitHub 远端接入尝试

- 时间：2026-10-07
- 操作：通过 GitHub 插件（MCP）确认账号 LeeSiyuann；调用 create_repository 创建 `blokus`；配置本地远端 origin=https://github.com/LeeSiyuann/blokus.git；新增 .github/pull_request_template.md
- 结果：
  - `get_me` 成功（账号 LeeSiyuann / 李思源）
  - `create_repository` 失败：**403 Resource not accessible by integration**（插件令牌无 administration 权限）
  - 本地远端与 PR 模板已完成
- 验证：`git remote -v` 显示 origin；`git log` 显示提交 0cec778
- 提交：0cec778
- 遗留：M8 需用户二选一（网页建空仓库后我推送 / 为插件补授权后我建仓）

### OP-009 确认 GitHub 连接器权限边界

- 时间：2026-10-07
- 操作：检查本机插件清单（.codex-plugin/plugin.json、.app.json、remote-plugin-install.json）确认 GitHub 插件为 OpenAI 托管的连接器型 GitHub App；确认系统级 git credential.helper=manager 可用
- 结论：连接器无 `Administration` 权限且用户无法自行增补 → 重新授权不能获得建仓能力；推荐改为"用户建空仓库 + 本地 git push（GCM 授权）"或"短期 PAT"
- 验证：create_repository 403 记录 + 插件清单文件内容
- 提交：本次提交
- 遗留：M8 待用户执行建仓（或提供 PAT）

### OP-010 M8 完成：推送到 GitHub

- 时间：2026-10-07
- 操作：用户在 GitHub 手工创建空仓库 LeeSiyuann/blokus；本机执行 `git push -u origin main`（Git Credential Manager 浏览器授权一次）；随后用 GitHub MCP 校验远端
- 验证：
  - `list_commits` 返回 9 条提交，与本地一致（HEAD=0260932）
  - `get_file_contents` 根目录包含 .github、.gitignore、AGENTS.md、README.md、docs、index.html、js、launcher.cmd、logs、package.json、scripts、server、styles.css、tests
- 提交：本次提交
- 遗留：无（M0–M8 全部完成）；后续 PR 等待用户明确提示

### OP-012 M10 对齐官方游戏规则（缺陷修复）

- 时间：2026-10-07
- 背景：用户指出实现逻辑有问题。核对官方规则后确认——v1 把邻接规则写反了：官方要求「同色必须角对角相接、禁止同色边贴边；异色允许边贴边、禁止角对角接触」，而旧实现是「同色必须边相邻、禁止异色边相邻」。
- 操作（分支 fix/official-adjacency-rules）：
  - `js/rules.js`：新增 `RULES_VERSION=2`、`DIAGS`，把原实现保留为 `canPlaceV1`，新增官方规则 `canPlaceV2`，`canPlace()` 按 `state.rulesVersion` 分派；共用前置校验 `commonPlacement()`（越界/重叠/首子覆盖角）
  - `js/game.js`：`createGame` 默认写入 `rulesVersion: 2`；`rebuild/fromJSON` 对缺省值按 **v1** 处理（兼容旧存档）；`toJSON` 输出该字段
  - `js/notation.js`：文本棋谱新增 `Rules: vN` 行并可解析；缺省按 v1
  - `js/i18n.js` / `js/ui.js` / `js/storage.js`：新增错误文案（`same_color_edge` / `opposite_corner` / `no_own_corner`）、对局横幅增加规则提示、历史与回放页标注「旧规则对局（v1）」
  - `tests/run-all.js`：重写规则用例为官方邻接矩阵（同色角/边、异色角/边四种组合），新增 v1 兼容与双版本整局模拟、棋谱版本往返
  - 文档：新增 `docs/RULES.md`（官方规则 + 常见误区 + 实现对照 + 版本策略），更新 `docs/DESIGN.md`（规则章节拆为 v2 官方 / v1 兼容）、`README.md`、`docs/IMPLEMENTATION.md`
- 验证：`node tests/run-all.js` **556/556**；服务端 `--selftest` OK；`tests/browser-smoke.js` **25/25**；`tests/browser-lan-smoke.js` **18/18**
- 提交：见 PR（分支 fix/official-adjacency-rules）
- 遗留：平局细则（官方部分版本为"先出完者优先"）未实现，已在 docs/RULES.md 列为已知差异

