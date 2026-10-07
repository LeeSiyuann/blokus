# 角斗士棋 Blokus（4 人复刻版）

浏览器直接可玩的 4 人 Blokus：单机热座 + 局域网联机、进度保存、历史回放、棋谱导出，中英文双语，默认开启音效。
**零依赖、零构建、无需部署**。

## 快速开始

单机（最简）：

1. 双击 `index.html`（Windows 可双击 `launcher.cmd`）；
2. 在启动器中选择「单机热座」。

局域网联机（需本机安装 Node.js 18+）：

1. 双击 `launcher.cmd`（或在终端执行 `node server/lan-server.js --port 8765 --open`）；
2. 主机在启动器中选择「局域网联机 → 创建房间」，把页面显示的地址/房间码发给同网段玩家；
3. 其他玩家打开该地址，选择「加入房间」。

> 3–4 人联机同样流程：房主创建房间时选择座位数，其他玩家依次加入，房主点击「开始对局」。

## 功能

- 标准 20×20 四人规则：首子覆盖起始角；后续棋子必须与同色棋子角接触、不能边接触；异色允许边/角接触；无子可下时 PASS。
- 计分：剩余每格 -1 分；全部出完 +15 分，最后放单格 I1 额外 +5 分（共 +20）。
- 单机与联机：4 人标准模式；2/3 人明确标注「简化模式」（每人一色、20×20 棋盘，双人蓝/红对角，三人蓝/黄/绿）。不等同于官方双人每人两色或三人共享第四色玩法。
- 自动存档、继续上一局、历史对局列表。
- 回放器：上一步/下一步/自动播放/速度/跳转到第 N 步。
- 棋谱导出：可读文本（BKS1）+ 完整 JSON，支持复制、下载、导入还原。
- 中文 / English 切换；音效默认开启（WebAudio 合成，无音频文件）。

## 规则版本与旧存档

规则依据：[Mattel Blokus 官方说明书](https://service.mattel.com/instruction_sheets/R1983-0920.pdf)。
新对局使用规则版本 2：JSON 写入 game.rulesVersion，BKS1 文本写入 Rules: 2。
旧记录（无规则版本或版本 1）保留原着法和原计分，只允许回放与导出，并标注「旧版非标准规则 · 仅供回放」。
未完成的旧局也不能按新规则续玩；请新开对局。不会自动改写原存档或将旧动作静默套用新规则。
未知规则版本拒绝导入。新棋谱请使用本次修复后的版本打开，旧应用不识别 Rules 字段。

## 文档

- 实施方案：[docs/PLAN.md](docs/PLAN.md)
- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 实施文档：[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
- AI 二次开发接口：[docs/AI-EXTENSION.md](docs/AI-EXTENSION.md)
- 操作日志：[docs/LOG.md](docs/LOG.md)
- 协作规范：[AGENTS.md](AGENTS.md)

## 开发与验证

```bash
node tests/run-all.js            # 单元测试（零依赖，含规则版本回归）
npm run test:all                 # 单元 + 服务端自检 + 浏览器冒烟
node tests/browser-lan-smoke.js  # 局域网端到端（含简化模式标注）
```

浏览器测试需要本机安装 Chrome 或 Edge；截图输出在 `output/playwright/`（不入库）。

## 目录速览

```
index.html  启动器 + 对局 + 回放（单页三视图）
js/         pieces / rules / game / notation / storage / render / replay / i18n / sound / net / ui
server/     零依赖局域网服务（Node 内置模块）
tests/      Node 直跑测试
docs/       规划、设计、实施、AI 接口、日志
```

## 许可

个人学习用途复刻实现，未附带任何官方素材。

