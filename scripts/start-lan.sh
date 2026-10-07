#!/usr/bin/env bash
# 启动角斗士棋局域网服务（macOS / Linux）
set -e
cd "$(dirname "$0")/.."
exec node scripts/start-lan.js --port 8765

