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

- 标准 20×20 四人规则：角起始、同色边相邻、禁止与对手边相邻（角可相接）、pass、终局计分。
- 单机热座 2/3/4 人；局域网最多 4 人。
- 自动存档、继续上一局、历史对局列表。
- 回放器：上一步/下一步/自动播放/速度/跳转到第 N 步。
- 棋谱导出：可读文本（BKS1）+ 完整 JSON，支持复制、下载、导入还原。
- 中文 / English 切换；音效默认开启（WebAudio 合成，无音频文件）。

## 文档

- 实施方案：[docs/PLAN.md](docs/PLAN.md)
- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 实施文档：[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
- AI 二次开发接口：[docs/AI-EXTENSION.md](docs/AI-EXTENSION.md)
- 操作日志：[docs/LOG.md](docs/LOG.md)
- 协作规范：[AGENTS.md](AGENTS.md)

## 开发与验证

```bash
node tests/run-all.js            # 单元测试（491 项，零依赖）
npm run test:all                 # 单元 + 服务端自检 + 浏览器冒烟
node tests/browser-lan-smoke.js  # 局域网端到端（18 项）
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

