# 分支与合入规则（BRANCH-RULES）

> 版本：v1.0 ｜ 生效日期：2026-10-07 ｜ 适用仓库：https://github.com/LeeSiyuann/blokus

## 1. 核心规则

1. **禁止直接提交 / 推送到 `main`**：所有改动必须先建临时分支。
2. **所有改动必须通过 PR（MR）合入**：由仓库所有者（LeeSiyuann）审阅并合入。
3. **合入后立即删除源分支**：合并时勾选 Delete branch；仓库级「自动删除头分支」开启后为自动执行。
4. 临时分支命名：`<类型>/<简短描述>`，类型 ∈ `feat | fix | docs | chore | refactor | test`，
   例如 `fix/board-render`、`docs/branch-rules`、`feat/lan-reconnect`。
5. 分支生命周期：创建 → 提交 → 推送 → PR → 审阅/CI → 合入（自动删除）→ 本地分支清理。

## 2. 本地强制（已随本仓库配置）

仓库内置 Git hooks，并由本地 `core.hooksPath` 指向 `.githooks`：

| Hook | 作用 |
| --- | --- |
| `.githooks/pre-commit` | 当前分支为 main/master 时直接拒绝提交，并打印正确做法 |
| `.githooks/pre-push` | 目标为 `refs/heads/main`（或 master）时拒绝推送 |

启用方式（克隆仓库后执行一次）：

```bash
git config core.hooksPath .githooks
```

创建分支的快捷命令：

```bash
scripts/new-branch.sh fix/board-render       # macOS / Linux / Git Bash
scripts\new-branch.cmd fix/board-render      # Windows cmd
```

> 紧急绕过：`git commit --no-verify` / `git push --no-verify`。仅在修复仓库自身规则等极少数场景使用，使用时必须在日志中说明原因。

## 3. GitHub 侧规则集（需仓库所有者在网页设置，约 30 秒）

> 说明：GitHub 连接器（MCP）没有提供规则集/仓库设置类接口，且其 App 权限不含 Administration，因此这两步必须在网页完成。

### 3.1 分支规则集（Block direct pushes to main）

1. 打开 https://github.com/LeeSiyuann/blokus/settings/rules → **New ruleset** → **New branch ruleset**
2. Ruleset Name：`protect-main`；Enforcement status：**Active**
3. **Target branches** → Add target → **Include default branch**（即 main）
4. 勾选以下规则：
   - **Require a pull request before merging**（必需；这是"禁止直接推送 main"的关键）
     - Required approvals：`0`（个人项目）或 `1`（需要自审时）
     - 可选：Dismiss stale pull request approvals when new commits are pushed
   - **Block force pushes**（防止强推覆盖历史）
   - 可选：**Restrict deletions**（禁止删除 main）
   - 可选：**Require status checks to pass**（等接入 CI 后再开）
5. **Bypass list** 留空（即包括管理员也遵守），或按需加入你自己
6. Create

### 3.2 合入后自动删除源分支

https://github.com/LeeSiyuann/blokus/settings → **General** → 页面中部 **Pull Requests** 区块 →
勾选 **Automatically delete head branches**。

（若暂不勾选，则每次合并时在绿色按钮下方勾选 **Delete branch**，效果相同。）

## 4. 标准操作流程

```bash
# 1) 从最新 main 建临时分支
git checkout main && git pull
scripts/new-branch.sh fix/board-render

# 2) 提交（会被 pre-commit 校验分支名）
git add -A
git commit -m "fix(ui): 修正棋盘缩放"

# 3) 推送临时分支
git push -u origin fix/board-render

# 4) 创建 PR（agent 会按模板生成描述，并附检查结果）
#    base: main   head: fix/board-render

# 5) 所有者合入并删除源分支（自动或勾选 Delete branch）

# 6) 本地清理
git checkout main && git pull
git branch -d fix/board-render
```

## 5. PR 必填内容（见 .github/pull_request_template.md）

- 变更内容与原因
- 验证证据（`node tests/run-all.js` / `npm run test:all` / 联机端到端）
- 影响范围与回滚方式
- **合入后立即删除源分支**（模板中固定勾选项）

## 6. Agent（Codex）执行约定

- 每次改动自动走：临时分支 → 提交 → 推送 → PR（描述含验证结果）→ 汇报链接 → 等待所有者合入。
- 收到合入通知后：`git checkout main && git pull`，再开始下一个临时分支；确认远端源分支已删除。
- 未经所有者明确提示，不主动创建 PR（历史约定）；**本文档生效后，PR 成为标准流程的一部分**，
  即"创建 PR"由用户在需求中授权，或按用户当次指示执行。

