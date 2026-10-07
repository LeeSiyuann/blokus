# 角斗士棋 Blokus（4 人复刻版）

浏览器直接运行的 Blokus：单机热座、局域网联机、进度保存、历史回放、棋谱导入导出、中英文界面和默认音效。**零依赖、零构建**。

## 快速开始

单机：双击 `index.html` → 启动器选择「单机热座」→ 选择人数和昵称。不需要 Node 或服务器。

局域网联机（主机需要 Node.js 18+，其他玩家只需浏览器）：

1. Windows 双击 `launcher.cmd`，或运行 `node scripts/start-lan.js --port 8765`；macOS/Linux 可运行 `bash scripts/start-lan.sh`。
2. 在启动器选择「局域网联机」，房主创建房间，分享页面中的主机地址和房间码。
3. 同网段玩家打开分享链接并加入，房主在至少两人加入后开始。

启动辅助会发现本机 IPv4 地址并打开浏览器。多网卡时请确认分享的是其他设备能访问的地址；大厅可手动填写主机地址。
也可直接运行 `node server/lan-server.js --port 8765 --advertise 192.168.1.10`，再手动打开 `http://localhost:8765/`；示例 IP 请换成本机地址。
无 Node 时，`launcher.cmd` 自动打开单机入口。

## 功能与规则

- 4 人标准模式：20×20 棋盘，首子覆盖自己的起始角；后续棋子须与同色角接触且不得边接触；异色接触不限。无合法落子时 PASS 并退出后续轮次。
- 2/3 人标注「简化模式」：每人一色，棋盘仍为 20×20；双人蓝/红对角，三人蓝/黄/绿。官方双人每人两色、三人共享第四色变体尚未实现。
- 剩余每格 -1 分；全部出完 +15，最后出 I1 总计 +20；并列最高分共同获胜。
- 从新局零步开始自动保存，刷新后继续；保存失败明确提示。历史列表提供回收站与恢复。
- 回放支持前后步进、自动播放、即时变速和跳转；回放状态与正在玩的对局隔离。
- 单局 BKS1 文本/JSON 可复制、下载、导入。文本还原着法与座位，JSON 还保留计时和终局信息。
- 历史中的「备份全部数据」导出设置、全部棋谱、回收站和继续指针；通过「导入棋谱」恢复。联机身份凭据不进入备份。
- 联机可刷新恢复同一座位，显示连接/在线状态；支持退出、房主踢人、房主转移和同房再战。离席记录为 RESIGN；关页面或临时断线保留座位。
- CLI 服务自动保存房间，重启可恢复未过期的对局；导入的联机棋谱用于回放，恢复席位须使用原浏览器连接身份。
- 中英文切换及音效设置持久化；WebAudio 在首次用户手势后启用，关闭后保持静音。

规则依据：[Mattel Blokus 官方说明书](https://service.mattel.com/instruction_sheets/R1983-0920.pdf)。

## 兼容与数据边界

新局使用规则版本 2（JSON `rulesVersion`、文本 `Rules: 2`）。无版本或版本 1 的旧记录保留原着法与计分，仅允许回放和导出；未知版本拒绝。
损坏棋谱、错误轮次/手号和与着法不符的棋盘快照直接拒绝，不再静默跳过动作。新棋谱请使用当前版本打开。

浏览器容量按 200 局 / 4 MiB 管理：自动回收最旧的终局或回收站记录及其正文，保留正在进行的对局；容量仍不足则提示失败。清除浏览器数据或换浏览器前请备份。
房间无活动两小时回收；主机需保留被 gitignore 的 `server/rooms.json`。仅面向可信局域网，跨网段/NAT 和公网部署不在本版本范围内。

## 文档

- [R1–R12 验收矩阵、修复清单与剩余改进](docs/REQUIREMENTS.md)
- [实施方案](docs/PLAN.md) · [设计](docs/DESIGN.md) · [使用与验证](docs/IMPLEMENTATION.md)
- [AI 预留设计与实际接口](docs/AI-EXTENSION.md) · [操作日志](docs/LOG.md) · [协作规范](AGENTS.md)

## 开发与验证

```bash
node tests/run-all.js                  # 单元与数据可靠性：673 项
node server/lan-server.js --port 18345 --selftest
node tests/server-reliability.js       # 服务端恢复/鉴权/生命周期：22 项
node tests/browser-smoke.js            # 单机界面：44 项
node tests/browser-lan-smoke.js        # 双页面联机：28 项
npm run test:all                       # 上述全部验证
```

单元测试和服务需要 Node 18+；浏览器测试使用 Node 22+ 的内置 WebSocket 及已安装的 Chrome/Edge，无 npm 依赖。
2026-10-08 全部通过，截图位于 `output/playwright/`（不入库）。联机已验证同机两个独立页面；真实跨设备、防火墙和 macOS/Linux 启动还需现场验证。

## 目录

```
index.html / styles.css  启动器、对局、历史、回放
js/                     规则、状态机、棋谱、存储、渲染、网络与界面
server/lan-server.js     Node 内置模块实现的局域网服务
scripts/                地址发现与浏览器启动辅助
tests/                  Node/CDP 零依赖验证
docs/                   规划、设计、验收、AI 接口与日志
```

## 许可

个人学习用途复刻实现，未附带官方素材。
