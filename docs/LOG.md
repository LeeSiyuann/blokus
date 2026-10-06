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

