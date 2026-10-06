@echo off
setlocal
cd /d "%~dp0.."
if "%~1"=="" (
  echo 用法: scripts\new-branch.cmd ^<类型/描述^>
  echo 示例: scripts\new-branch.cmd fix/board-render
  echo 类型: feat ^| fix ^| docs ^| chore ^| refactor ^| test
  exit /b 1
)
git checkout -b "%~1"
if errorlevel 1 exit /b 1
echo 已切换到临时分支 %~1；完成后执行: git push -u origin %~1 并创建 PR。
endlocal

