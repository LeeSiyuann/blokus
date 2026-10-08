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


### OP-011 修正规则并标注简化模式（M9）

- 时间：2026-10-07（Asia/Shanghai）
- 操作：按 Mattel 官方说明书修正同色角接触、禁止同色边接触、异色接触不限；全部出完 +15、单格收尾总计 +20。单机/联机 2、3 人标注简化模式，4 人标注标准模式，中英同步。
- 兼容：新局规则版本 2；JSON rulesVersion 与 BKS1 Rules 字段随记录传递；缺省/版本 1 使用旧解释器，仅从 UI 回放/导出，保留原着法与计分，未知版本拒绝。离开回放时暂停，避免旧回放覆盖新对局。
- 文件：AGENTS.md、README.md、index.html；js/rules.js、game.js、notation.js、storage.js、i18n.js、ui.js；server/lan-server.js；tests/run-all.js、browser-smoke.js、browser-lan-smoke.js；docs/DESIGN.md、IMPLEMENTATION.md、AI-EXTENSION.md、PLAN.md、plan/PLAN.json、LOG.md；logs/2026-10-07.md。
- 验证：node tests/run-all.js 620/620；服务端 --port 18345 --selftest OK；浏览器冒烟 35/35；双页面联机端到端 19/19；git diff --check 通过。受限环境启动浏览器超时，经批准在沙箱外执行通过。
- 界面证据：output/playwright/06-simplified-en.png、07-legacy-replay.png、10-lan-lobby.png、11-lan-game.png；已查看简化模式及旧版回放截图，文字清晰；截图不入库。
- 提交：be51391（规则、界面、兼容、测试和文档）；本次收尾文档提交将 M9 置为 done 并回填定位。
- 遗留：旧局只能回放/导出，请新开局使用修正规则；此前审计发现的其他问题（联机恢复、存储容量、导入完整性等）不属于本次修复范围。

## 2026-10-08

### OP-012 R1–R12 正确性、数据可靠性与联机生命周期补齐（M10）

- 时间：2026-10-08（Asia/Shanghai）。
- 规划：在 PLAN.json/PLAN.md 登记 M10=doing，按动作/数据、联机、界面、验证/文档顺序实施；验收矩阵见 REQUIREMENTS.md。
- 操作：严格 JSON/BKS1 动作与快照校验；保存动作用时和终局持续时间、并列赢家；文本引用昵称与自定义颜色顺序；独立回放状态与即时变速；本地存储失败回滚/反馈、正文容量清理、回收站恢复与全量 JSON 备份；LAN 身份恢复、SSE 鉴权/在线状态、重复/过期提交检查、退出/踢人/房主转移/同房再战、离席 RESIGN、CLI 房间重启恢复和可分享地址；中英动态提示、输入保护、复制降级、昵称转义与音效去重；启动辅助从核心分离，AI 文档区分实际导出与未来方案。
- 变更文件：index.html、js/game.js、rules.js、notation.js、storage.js、replay.js、net.js、ui.js、i18n.js；server/lan-server.js；scripts/start-lan.js、start-lan.sh、launcher.cmd、package.json；tests/reliability.js、server-reliability.js、run-all.js、browser-smoke.js、browser-lan-smoke.js；README.md、AGENTS.md、docs/DESIGN.md、IMPLEMENTATION.md、AI-EXTENSION.md、REQUIREMENTS.md、PLAN.md、plan/PLAN.json、LOG.md；logs/2026-10-08.md。
- 验证：最终 npm run test:all → 单元 673/673，服务自检 OK，服务可靠性 22/22，单机浏览器 44/44，双页面联机 28/28；启动辅助 --selftest OK。18 个 JavaScript 文件语法检查与 git diff --check 通过；浏览器经批准在沙箱外启动。
- 界面证据：output/playwright/08-history-reliability.png、12-lan-recovery.png；已查看英文历史/损坏导入提示、简化模式和联网离席状态，排版清晰；截图不入库。
- 提交：8fa28c9（引擎/数据/联机/界面、测试及文档）；收尾文档提交回填此哈希并置 M10=done。
- 遗留：真实多设备/防火墙、多网卡与 macOS/Linux/Firefox 实测尚未完成；手机/读屏、枚举性能、UI 拆分及服务磁盘故障事务可继续改善；AI 对手与官方双人/三人变体不属于当前需求。旧局只回放，联机身份不随公开备份迁移；未 push、未创建 PR。

## 2026-10-09

### OP-013 落实功能、界面与技术推荐改进（M11）

- 时间：2026-10-09（Asia/Shanghai）。
- 规划：先登记 PLAN.json/PLAN.md 的 M11=doing，依次实施服务事务、规则候选枚举、UI 控制器拆分、窄屏/可访问交互、数据边界与验收文档。
- 功能与界面：触屏先预览再确认，键盘棋盘导航/落子，读屏 400 格文本与实际 AX 树，弹窗背景 inert/Tab 循环/Escape 返回焦点；四色字母辅助与持久化设置；所选棋子的合法落点提示；320/390px 英文布局/44px 操作按钮，修正缩放坐标及提示遮挡操作区。
- 技术：合法枚举改为连接点候选锚点，保持新旧规则的原顺序并与独立穷举比较，PASS 检查与限量枚举提前返回；终局/退出/无效限制无假 PASS。提取 ui-records/ui-lan/ui-accessibility 控制器，保持原生零依赖/传统 script/file://。服务快照 fsync/rename，先存盘再响应/广播/关闭连接，写入失败回滚；坏房间隔离、坏整文件拒绝启动且保留原文；异步读取后确认房间仍存在。
- 复核追加：重复服务测试复现 Windows 文件替换 EPERM，补充最多 4 次重试/总等待上限 50ms；持续占用仍回滚，日志只含错误码。元数据显式人数/null 时间拒绝、finishedAt=0 保留；备份合并排序与失效继续指针清理。
- 变更文件：index.html、styles.css、package.json；js/rules.js、game.js、storage.js、render.js、i18n.js、ui.js，以及新增 ui-records.js、ui-lan.js、ui-accessibility.js；server/lan-server.js 与新增 room-store.js；tests/run-all.js、reliability.js、server-reliability.js、browser-smoke.js，以及新增 placement-reference.js、improvements.js、benchmark-rules.js；README.md、AGENTS.md、docs/DESIGN.md、IMPLEMENTATION.md、AI-EXTENSION.md、REQUIREMENTS.md、PLAN.md、plan/PLAN.json、LOG.md；logs/2026-10-09.md。
- 验证：最终 npm run test:all → 单元 957/957、服务自检 OK、服务可靠性 42/42、单机浏览器 61/61、双页面联机 28/28；启动辅助自检 OK。文件占用修复后服务可靠性连续 30 轮通过；25 个 JavaScript 文件语法与 git diff --check 通过。浏览器经批准于沙箱外启动。
- 性能：固定 32 手局面先校验枚举结果一致，再预热/采样 10 次；本机一次样本穷举约 14.42ms、候选约 2.60ms，约 5.5 倍，仅代表该样本。
- 界面证据：output/playwright/13-mobile-game.png、14-narrow-game.png、15-mobile-export.png；已查看 390/320px 英文棋盘/字母辅助/操作区与导出弹窗，发现提示遮挡后修正并再次复核。截图、房间文件及含身份的 invalid.tmp 备份均不入库。
- 提交：a83eb01（功能/界面/技术、测试及文档）；收尾文档提交回填此哈希并将 M11 置 done。
- 遗留：物理手机/读屏软件、不同色觉体验、真实多设备/防火墙/多网卡与 Firefox/macOS/Linux 仍待现场验收；跨进程数据存储及断电目录持久性不作保证。AI 对手、官方双人/三人变体和公网对战不属于本轮范围。未 push、未创建 PR。

### OP-014 全面缺陷复核与全功能回归（M12）

- 时间：2026-10-09（Asia/Shanghai）。用户授权检查全部功能、修复、本地提交并推送 origin；先登记 PLAN.json/PLAN.md 的 M12=doing。
- 基线：npm run test:all 全部通过（957 单元、42 服务、61 单机、28 联机）；代码和边界复核发现原测试未覆盖的交互缺陷。回放跳转新增断言先实际失败，再修复后通过。
- 修复：选子刷新旋转/翻转按钮并增加朝向预览；跳转先捕获输入，重开回放应用所选速度；重复文件选择；删除失败反馈；损坏历史摘要恢复、零更新时间排序和 LAN 覆盖继续指针；原生降级复制焦点及在线广播保留导出选区；建房/加入/恢复防重复，旧客户端迟到回调隔离；服务 JSON/人数/不完整状态版本字段校验。
- 文件：index.html、styles.css、js/ui.js、ui-records.js、ui-lan.js、ui-accessibility.js、storage.js、i18n.js；server/lan-server.js；tests/reliability.js、server-reliability.js、browser-smoke.js、browser-lan-smoke.js；package.json、AGENTS.md、README.md、docs/DESIGN.md、IMPLEMENTATION.md、REQUIREMENTS.md、PLAN.md、plan/PLAN.json、LOG.md、logs/2026-10-09.md。AI 扩展接口未改变，仍只预留设计。
- 验证：最终 npm run test:all → 963/963 单元、服务自检 OK、51/51 服务可靠性、90/90 单机浏览器、30/30 双页面联机；启动辅助自检 OK。新旧规则各 2/3/4 人、LCG 种子 17/911：12 完整局、663 手、每 8 手比较剩余棋子的 1095 次候选/穷举结果、24 次 JSON/文本终局往返通过。
- 界面与文件证据：实际浏览器 R/F、悔棋重放、PASS 终局、回放前后/跳转/4×/暂停/重开、设置刷新；实际下载文本/JSON 后校验内容，CDP 选择 JSON 文件、FileReader 导入；Clipboard API 拒绝后原生 execCommand 复制并恢复焦点；双击只新增一个房间，在线广播不影响导出选择。查看 16-selected-orientation.png 并复核 14-narrow-game.png/15-mobile-export.png。截图和下载 output/playwright/ 不入库。
- Git/远端：fetch 成功，origin/main=85436dd 已有独立规则/旋转 PR，与本地 M9–M11 分叉；远端 BRANCH-RULES 禁止直推 main。创建 codex/full-feature-audit 交付当前完整版本，旋转改善适配本地控制器；不合并/覆盖 main，不创建 PR，不强制推送。
- 静态检查：25 个 JavaScript 文件 node --check、git diff --check 均通过；工作区仅包含源代码/测试/文档，截图、下载及私有房间文件保持 gitignore。
- 提交与推送：实现提交 eea2a55（完整哈希 eea2a55184e921be2a7778b2479ae9e6535b04a5），git push -u origin codex/full-feature-audit 成功，ls-remote 与本地一致。收尾文档提交回填 done/定位，并继续同步同一分支；未创建 PR。
- 遗留：真实跨设备/网络、防火墙/多网卡、物理手机/NVDA/VoiceOver、声音听测及其他系统/浏览器仍待现场验收；测试不保证所有环境无缺陷。main 分支合并留待用户后续流程。
