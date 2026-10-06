#!/usr/bin/env bash
# 创建临时分支：scripts/new-branch.sh fix/board-render
set -e
cd "$(dirname "$0")/.."
if [ -z "$1" ]; then
  echo "用法: scripts/new-branch.sh <类型/描述>"
  echo "示例: scripts/new-branch.sh fix/board-render"
  echo "类型: feat | fix | docs | chore | refactor | test"
  exit 1
fi
git checkout -b "$1"
echo "已切换到临时分支 $1；完成后执行：git push -u origin $1 并创建 PR。"

