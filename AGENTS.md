# AGENTS.md — Blokus（角斗士棋）项目协作与执行规范

> 本文件是本仓库的**最高优先级工作约定**。任何 agent（人或 AI）在本仓库操作前必须先阅读并遵守。
> 最后更新：2026-10-07（v1.1）

## 1. 项目目标

复刻标准 4 人 Blokus（角斗士棋）：浏览器直接运行、无需部署环境、支持多人（单机热座 + 局域网联机）、
可保存进度、可浏览与回放历史对局、可导出棋谱、中英文双语、默认开启音效。
当前**不实现 AI 对手**，但必须保留可二次开发的顶层设计与接口参数文档。

## 2. 需求清单（验收基线）

| 编号 | 需求 | 验收方式 |
| --- | --- | --- |
| R1 | 纯静态技术栈，双击/一条命令即可运行 | 双击 `index.html` 或运行 `launcher.cmd` 可进入游戏 |
| R2 | 启动器：可选单机 / 局域网联机，并由启动器进入游戏 | 首屏为模式选择界面 |
| R3 | 单机热座 2–4 人 | 可完整下完一局并正确计分 |
| R4 | 局域网联机 | `node server/lan-server.js` 后同网段多设备可同房对局 |
| R5 | 中英文界面切换 | 切换语言后所有界面文案跟随，刷新后保持 |
| R6 | 四色配色（蓝/黄/红/绿） | 棋盘与棋子固定四色 |
| R7 | 默认开启音效，可关闭 | 落子/非法/胜利等音效，设置持久化 |
| R8 | 保存进度 | 刷新/关闭后可"继续上一局" |
| R9 | 历史对局列表 | 展示时间、模式、玩家、比分 |
| R10 | 回放：逐步前进/后退/自动播放/跳转 | 回放器控件齐全且与棋盘同步 |
| R11 | 导出棋谱 | 文本棋谱 + JSON，可复制/下载/导入 |
| R12 | AI 预留设计 | `docs/AI-EXTENSION.md` 含接口参数表与挂载点 |

## 3. 技术约束（不可违反）

1. **零依赖、零构建**：不使用任何 npm 运行时依赖、不使用打包器；`package.json` 可选，仅用于脚本别名。
2. **浏览器端脚本必须兼容 `file://` 直开**：使用传统 `<script>`（非 ES Module）；不得要求本地服务器才能玩单机。
3. **局域网服务端只用 Node 内置模块**：`http`、`crypto`、`fs`、`path`、`url`。SSE 推送 + REST 提交，不引入 WebSocket 库。
4. **规则引擎双端复用**：`js/rules.js`、`js/pieces.js`、`js/game.js`、`js/notation.js` 必须同时满足
   浏览器（挂载 `window.BK`）与 Node（`module.exports`）两种加载方式，服务端校验与服务端测试复用同一份代码。
5. **不写入用户未授权目录**；不新增二进制资源（音效用 WebAudio 合成，图标用内联 SVG/字符）。
6. **数据可移植**：所有持久化数据都能通过 JSON 导出/导入，不锁定浏览器。

## 4. 协作流程（每次操作必须执行）

> "一次操作" = 一个可描述、可验证的变更单元（新增功能、修 bug、改文档、发版本）。

1. **规划**：操作前先在 `docs/plan/PLAN.json` 中登记任务（`id`/`title`/`status=doing`），并更新 `docs/PLAN.md` 与进度。
2. **实施**：小步提交，保持可运行；破坏性调整必须单独提交并说明回滚方式。
3. **验证**：执行 `node tests/run-all.js`；涉及界面的改动补充说明验证方式（截图/浏览器手测记录）。
4. **文档**：同步更新受影响的 `docs/DESIGN.md` / `docs/IMPLEMENTATION.md` / `docs/AI-EXTENSION.md` / `README.md`。
5. **日志**：在 `docs/LOG.md` 追加一条操作日志（时间、操作、变更文件、验证结果、遗留问题），同时在 `logs/YYYY-MM-DD.md` 追加同日流水。
6. **提交**：`git add -A && git commit`，提交信息遵循 `type(scope): summary`；一次操作至少一个提交。
7. **收尾**：更新 `docs/plan/PLAN.json` 状态为 `done`，记录 commit hash 到 `docs/LOG.md`。
8. **汇报**：向用户简要汇报：做了什么、验证结果、下一步。

### 提交信息规范

`feat|fix|docs|chore|test|refactor(scope): 中文简述`，例如：
`feat(engine): 实现落子合法性与计分`

### 禁止事项

- 未经用户明确提示，**不得创建 PR / MR**（用户自行触发合入；创建后需要把 PR 链接汇报给用户）。
- 不得把密钥、令牌写入仓库或日志。
- 不得用 `git push --force`、`git reset --hard` 等破坏性命令。

## 5. 目录结构

```
index.html            入口（启动器 + 游戏 + 回放，视图切换）
styles.css
js/pieces.js          21 种棋子与 8 向旋转/翻转
js/rules.js           规则判定与计分（纯函数）
js/game.js            对局状态机（双端复用，AI/网络挂载点）
js/notation.js        棋谱导出/导入（文本 + JSON）
js/storage.js         localStorage 存档与历史索引
js/render.js          Canvas 棋盘与棋子渲染
js/replay.js          回放播放器
js/i18n.js            中英文词条与切换
js/sound.js           WebAudio 合成音效（默认开）
js/net.js             局域网客户端（SSE + REST）
js/ui.js              界面总控（视图路由、事件绑定）
server/lan-server.js  零依赖局域网服务（静态托管 + 房间 + 裁判）
scripts/              启动脚本（Windows/macOS/Linux）
tests/                Node 直跑的零依赖测试
docs/                 规划、设计、实施、AI 扩展、日志
```

## 6. 验证命令

```bash
node tests/run-all.js            # 全部单元测试
node server/lan-server.js --port 8765 --selftest   # 服务端自检后退出
npm run test:all                 # 单元 + 服务端自检 + 浏览器冒烟（需 Chrome/Edge）
node tests/browser-smoke.js      # 浏览器界面冒烟（启动器/对局/存档/导出/回放）
node tests/browser-lan-smoke.js  # 局域网端到端（两个页面同房对局）
```

浏览器验证：`index.html`（单机/回放）与 `http://localhost:8765/`（联网）。
截图输出：`output/playwright/`（已 gitignore，仅作验收证据，不入库）。

## 7. MCP 规划与完成记录

本项目要求"使用 MCP 做规划与完成定位记录"。当前环境已确认可用的 MCP：
`codex_app`（线程/工件/PR 附件）、`code_review`（PR 检查）、`node_repl`（脚本执行）、`unified-computer-use`（浏览器验证）。
本仓库以其为工具层，并约定：

- **规划记录**：`docs/plan/PLAN.json`（机器可读，含 `id/title/status/commit`）为单一事实来源；
- **完成定位**：每个操作在 `docs/LOG.md` 写明 commit hash、涉及文件、验证证据；
- **PR 阶段**：使用 `code_review` MCP 读取检查结果、使用 `codex_app` MCP 附加 PR 工件；
- 若后续环境提供专用任务/计划 MCP，则替换 `PLAN.json` 为对应 MCP 并在此处更新说明。

### 已验证可用的 MCP（2026-10-07）

| MCP | 用途 |
| --- | --- |
| codex_app | 线程/工件/PR 附件管理（创建 PR 后用于附加并通过 UI 汇报） |
| code_review | 读取 PR/MR 的 CI 检查结果（创建 PR 后使用） |
| node_repl | 脚本执行（浏览器冒烟测试的调试辅助） |
| unified-computer-use（cua_repl） | 需要真实浏览器会话时的界面验证备选 |

## 8. 远程仓库与 PR 约定

- 目标远端：GitHub 上与本项目同名的仓库 `blokus`。
- 推送需要用户**一次性授权**（本机未安装 gh，且无 GITHUB_TOKEN；沙箱网络受限）。
- **只有在用户明确提示时才创建 PR/MR**；创建后必须：① 用 `code_review` MCP 读取检查结果；② 用 `codex_app` MCP 附加 PR 工件；③ 把链接汇报给用户，由用户合入。

### M8 阻塞原因（2026-10-07 实测）

- GitHub 插件（`plugin_connector_1p_1a69035c238881919c4190932b2df699`，connector `connector_76869538009648d5b282a4bb21c3d157`）是 **OpenAI 托管的 GitHub App 连接器**，不是本地 gh CLI。
- `create_repository` 返回 `403 Resource not accessible by integration`：该 App 未申请/未获 `Administration` 权限，**GitHub App 的权限集由 App 提供方固定，用户无法自行勾选增补**，重新授权只能调整"可访问哪些仓库"。
- 因此 M8 的可行路径：① 用户手工创建空仓库 `blokus`（不勾选任何初始化文件）→ 本地 `git push -u origin main`（Git Credential Manager 弹窗授权）；或 ② 用户提供短期 PAT 由 agent 建仓并推送；或 ③ 由连接器 `push_files` 上传（会把历史压平为一个提交，仅在①不可行时使用）。

### M8 完成记录（2026-10-07）

- 用户手工创建空仓库；本机执行 `git push -u origin main`（GCM 浏览器授权一次）→ 9 个提交全部推送成功。
- 远端地址：https://github.com/LeeSiyuann/blokus
- 校验：`get_file_contents` 根目录返回 .github/.gitignore/AGENTS.md/README.md/docs/index.html/js/launcher.cmd/logs/package.json/scripts/server/styles.css/tests；`list_commits` 返回 9 条与本地一致。
- 后续推送免密（凭据已由 Git Credential Manager 缓存）；**PR 仍需用户明确提示后再创建**。

