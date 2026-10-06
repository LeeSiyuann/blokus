# 实施文档（IMPLEMENTATION）

> 版本：v1.0 ｜ 日期：2026-10-06 ｜ 面向：使用者 / 二次开发者 / 维护者

## 1. 环境要求

| 场景 | 要求 |
| --- | --- |
| 单机热座 / 回放 / 棋谱 | 任意现代浏览器（Chrome / Edge / Firefox），双击 index.html 即可，无需安装任何东西 |
| 局域网联机 | Node.js 18+（本机已装 v24），仅用于跑 server/lan-server.js；玩家端只需浏览器 |
| 开发 / 测试 | Node.js 18+（跑 tests/），无 npm 依赖 |

## 2. 运行方式

### 2.1 单机（最简）

双击 `index.html`（或 `launcher.cmd`）→ 启动器选择「单机热座」→ 选人数与昵称 → 开始。

> file:// 协议下浏览器不允许联网请求，因此启动器会禁用「局域网联机」入口并显示提示，这是预期行为。

### 2.2 局域网联机

```bash
node server/lan-server.js --port 8765 --open     # 主机
```

1. 主机浏览器打开启动器 →「局域网联机」→ 创建房间，输入昵称；
2. 页面显示房间码（如 4F2K）与地址 `http://<主机IP>:8765/?room=4F2K`；
3. 其他玩家在同一局域网内打开该地址 → 加入房间（或手动输入房间码）；
4. 人齐后房主开始对局；服务端为裁判，轮次与合法性均校验。

Windows 若提示防火墙，请选择「允许专用网络」。跨网段/NAT 场景不在支持范围内。

### 2.3 启动脚本

| 脚本 | 平台 | 行为 |
| --- | --- | --- |
| launcher.cmd | Windows | 检测 Node → 启动局域网服务（默认 8765）→ 打开浏览器到启动器 |
| scripts/start-lan.sh | macOS / Linux | 同上（bash 版本） |
| index.html | 全平台 | 无 Node 时的单机 / 回放 / 导入导出入口 |

## 3. 文件清单

| 路径 | 说明 |
| --- | --- |
| index.html | 入口单页：启动器 / 对局 / 回放 三视图 |
| styles.css | 全部样式（含四色主题、响应式） |
| js/pieces.js | 21 种棋子定义与朝向变换 |
| js/rules.js | 规则判定与计分（纯函数，双端复用） |
| js/game.js | 对局状态机，双端复用，AI 挂载点 |
| js/notation.js | BKS1 文本 / JSON 棋谱编解码 |
| js/storage.js | localStorage 存档、历史索引、容量管理 |
| js/render.js | Canvas 渲染器 |
| js/replay.js | 回放播放器 |
| js/i18n.js | 中英文词条与切换 |
| js/sound.js | WebAudio 合成音效 |
| js/net.js | 局域网客户端（REST + SSE） |
| js/ui.js | 界面总控与事件绑定 |
| server/lan-server.js | 零依赖局域网服务（静态托管 + 房间 + 裁判） |
| tests/run-all.js | 规则/棋谱/状态机单元测试入口 |
| tests/browser-smoke.js | 浏览器界面冒烟测试（Chrome DevTools Protocol，零 npm 依赖） |
| tests/browser-lan-smoke.js | 局域网端到端测试（两个页面同房对局） |
| launcher.cmd / scripts/start-lan.sh | 一键启动局域网服务并打开浏览器 |
| docs/* | 方案、设计、实施、AI 接口、日志 |

## 4. 开发流程（与 AGENTS.md 同步）

1. 在 `docs/plan/PLAN.json` 登记任务（status=doing）；
2. 小步实现并自测：`node tests/run-all.js`；
3. 更新文档（DESIGN / IMPLEMENTATION / AI-EXTENSION / README 按需）；
4. 追加日志：`docs/LOG.md` + `logs/YYYY-MM-DD.md`；
5. `git add -A && git commit -m "type(scope): 说明"`；
6. 将 `PLAN.json` 置为 done 并写入 commit hash；向用户汇报。

### 提交信息

`feat | fix | docs | chore | test | refactor` + `(scope)` + 中文简述。

### 分支与 PR

- 主分支 `main` 保持可运行；
- **仅在用户明确提示时才创建 PR/MR**，由用户自行合入；
- PR 创建后把链接汇报给用户（并在需要时用 code_review MCP 读取检查结果）。

## 5. 测试与验证

```bash
node tests/run-all.js                             # 规则/棋谱/状态机 全量断言
node server/lan-server.js --port 8765 --selftest  # 服务端自检（起服→自测→退出）
node --check js/rules.js                          # 语法检查（逐文件）
node tests/browser-smoke.js                       # 浏览器界面冒烟（需 Chrome/Edge）
node tests/browser-lan-smoke.js                   # 局域网端到端（需 Chrome/Edge）
npm run test:all                                  # 单元 + 服务端自检 + 浏览器冒烟
```

### 最近一次全量验证结果（2026-10-07）

| 项目 | 结果 |
| --- | --- |
| node tests/run-all.js | 通过 491 / 491 |
| node server/lan-server.js --port 18345 --selftest | OK |
| node tests/browser-smoke.js | 通过 25 / 25（截图见 output/playwright/） |
| node tests/browser-lan-smoke.js | 通过 18 / 18 |

浏览器手测清单（每次发版前）：

1. 启动器：语言切换、音效开关、三入口可用性（file:// 下联机禁用提示）；
2. 单机：4 人各落 3 手 → 非法落子被拒（音效提示）→ PASS → 悔棋 → 刷新继续；
3. 回放：进入历史→逐步前进/后退→自动播放→跳转→速度切换；
4. 导出：文本棋谱 + JSON 下载/复制 → 清空后导入还原 → 回放一致；
5. 联机：两个浏览器窗口（不同 profile）同房对局，验证轮次锁定与断线重连。

## 6. 数据与迁移

- 所有数据存于浏览器 localStorage，键名见 DESIGN 第 7 节；`version` 字段用于迁移。
- 清除浏览器数据会丢失存档，请定期用「导出 JSON」备份；
- 导入时执行结构校验（20×20 棋盘、moves ≤ 5000、玩家 2–4 人），不合法则报错拒绝。

## 7. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击后「局域网联机」灰掉 | file:// 限制 | 用 launcher.cmd 或 node server/lan-server.js 后从 http:// 打开 |
| 其他设备打不开地址 | 防火墙 / 不同网段 | 放行专用网络；确认同一 Wi-Fi；用主机 IP 而非 localhost |
| 没有声音 | 浏览器自动播放策略 | 点击页面任意处后生效（首次手势创建 AudioContext） |
| 历史对局丢失 | 清理浏览器数据 | 从导出的 JSON 重新导入 |
| 回放与对局不一致 | 手改过存档 | 以 moves[] 为准自动重放，日志中会记录告警 |

## 8. 版本与发布

| 版本 | 日期 | 内容 | 提交 |
| --- | --- | --- | --- |
| v0.1.0 | 2026-10-06 | 仓库/文档/规范初始化 | 见 docs/LOG.md |
| v1.0.0 | 2026-10-07 | 完整实现：启动器、单机热座、局域网联机、存档、历史回放、棋谱导入导出、中英双语、音效 | 见 docs/LOG.md |

