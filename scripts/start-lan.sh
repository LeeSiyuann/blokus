#!/usr/bin/env bash
# 启动角斗士棋局域网服务（macOS / Linux）
set -e
cd "$(dirname "$0")/.."
exec node server/lan-server.js --port 8765 --open

