<!-- 建议标题格式：feat|fix|docs|chore(scope): 中文简述 -->

> 源分支：`<type>/<desc>` → 目标分支：`main`（本仓库禁止直接提交 main）

## 变更内容

<!-- 1–3 条要点，说明"做了什么"与"为什么" -->

## 验证

- [ ] `node tests/run-all.js` 全绿
- [ ] `npm run test:all`（含浏览器冒烟；如适用）
- [ ] `node tests/browser-lan-smoke.js`（如涉及联机）
- [ ] 手工验证关键路径（说明步骤）

## 影响范围

- 涉及模块：
- 数据结构/存档兼容性：
- 是否影响联机协议：

## 回滚方式

<!-- 例如：revert 本 PR 即可；或说明数据迁移的回退步骤 -->

## 关联

<!-- Closes #123 / 关联文档章节 -->

## 合入清单（合入者确认）

- [ ] **合入后立即删除源分支**（仓库已开启 Automatically delete head branches，或合并时勾选 Delete branch）
- [ ] 本地已同步：`git checkout main && git pull`

