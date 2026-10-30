@echo off
setlocal
chcp 65001 >nul
title dsh-today 插件安装程序

echo 正在启动 dsh-today 一键部署程序...
echo.

set "INSTALL_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$scriptDir = $env:INSTALL_DIR.TrimEnd('\'); $PSScriptRoot = $scriptDir; $scriptPath = Join-Path $scriptDir 'install.ps1'; if (Test-Path $scriptPath) { $code = [System.IO.File]::ReadAllText($scriptPath, [System.Text.Encoding]::UTF8); Invoke-Expression $code } else { Write-Host '[错误] 未找到 install.ps1 脚本文件。' -ForegroundColor Red }"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 安装过程中遇到异常，请检查上方日志。
    pause
)
