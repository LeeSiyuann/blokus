@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [Blokus] Node.js not found - opening single-player mode ^(file://^)...
  start "" "%~dp0index.html"
  exit /b 0
)
echo [Blokus] Starting LAN server on port 8765 ...
echo [Blokus] 局域网联机地址见下方输出；单机模式也可直接在浏览器中选择。
node "%~dp0scripts\start-lan.js" --port 8765
endlocal
