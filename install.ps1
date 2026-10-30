#Requires -Version 5.1
<#
.SYNOPSIS
    dsh-today 插件离线一键安装与自检脚本 (Windows)
.DESCRIPTION
    自动探测 DSH NEXT 运行环境、解包安装 dsh-today 生产归档包至本地插件源码目录、
    建立原生离线 link 注册、注入 cordis 插件配置并执行 doctor 运行自检。
    支持在 DSH NEXT 界面中无感秒级卸载与重新安装，无须任何外部 npm 仓库依赖。
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         dsh-today 插件离线一键安装程序 (v1.2.1)          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Node.js 环境
Write-Host "[1/5] 正在检查本地 Node.js 运行时..." -ForegroundColor Yellow
try {
    $nodeVer = & node -v
    Write-Host "  -> 检测到 Node.js 版本: $nodeVer" -ForegroundColor Green
    $major = [int]($nodeVer -replace '^v(\d+)\..*$', '$1')
    if ($major -lt 20) {
        Write-Host "  [警告] Today 插件建议使用 Node.js >= 20.0.0，当前版本较低可能会遇到兼容性问题。" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [错误] 未检测到 node.exe 命令。请先安装 Node.js (>=20) 并配置到 PATH 环境变量。" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}

# 2. 定位 DSH NEXT 配置文件与本地插件源码目录
Write-Host "[2/5] 正在定位 DSH NEXT 运行环境与本地插件目录..." -ForegroundColor Yellow
$rawHome = if ($env:DSH_USER_HOME) { $env:DSH_USER_HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath('UserProfile') }
$userHome = $rawHome.Trim()
$dshProfileDir = Join-Path $userHome ".dsh\profiles\desktop"
$dshPluginsSrcDir = Join-Path $userHome "dsh-plugins\src"
$localPluginDir = Join-Path $dshPluginsSrcDir "dsh-today"

if (-not (Test-Path $dshProfileDir)) {
    Write-Host "  -> 未找到已激活的 desktop profile 目录，尝试创建: $dshProfileDir" -ForegroundColor Gray
    New-Item -ItemType Directory -Path $dshProfileDir -Force | Out-Null
}
if (-not (Test-Path $dshPluginsSrcDir)) {
    New-Item -ItemType Directory -Path $dshPluginsSrcDir -Force | Out-Null
}

$targetModulesDir = Join-Path $dshProfileDir "node_modules"
if (-not (Test-Path $targetModulesDir)) {
    New-Item -ItemType Directory -Path $targetModulesDir -Force | Out-Null
}

Write-Host "  -> 本地插件部署目录: $localPluginDir" -ForegroundColor Green

# 3. 解包安装离线包
Write-Host "[3/5] 正在解包生产运行时文件..." -ForegroundColor Yellow
$scriptDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR.TrimEnd('\') } elseif ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
$tgzFile = Join-Path $scriptDir "dsh-today-1.2.1.tgz"

if (-not (Test-Path $tgzFile)) {
    $candidates = Get-ChildItem -Path $scriptDir -Filter "dsh-*.tgz"
    if ($candidates.Count -gt 0) {
        $tgzFile = $candidates[0].FullName
    } else {
        Write-Host "  [错误] 未在当前脚本目录下找到 dsh-today 安装归档包 (*.tgz)。" -ForegroundColor Red
        Read-Host "按回车键退出..."
        exit 1
    }
}

Write-Host "  -> 找到安装包: $tgzFile" -ForegroundColor Gray

if (Test-Path $localPluginDir) {
    Remove-Item -Path $localPluginDir -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
}
New-Item -ItemType Directory -Path $localPluginDir -Force | Out-Null

try {
    & tar -xzf $tgzFile -C $localPluginDir --strip-components=1
    Write-Host "  -> 核心组件解包完毕，本地源码目录就绪。" -ForegroundColor Green
} catch {
    Write-Host "  [错误] 解包失败: $_" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}

# 4. 注册并注入 DSH 配置（采用原生 link 模式，支持界面无感直删直装）
Write-Host "[4/5] 正在执行 DSH 原生离线 link 注册..." -ForegroundColor Yellow

# A. 清理历史残余
$legacyDir = Join-Path $targetModulesDir "dsh-connect-today"
if (Test-Path $legacyDir) {
    Remove-Item -Path $legacyDir -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
}

$dshPkgFile = Join-Path $dshProfileDir "package.json"
$linkSpec = "link:" + ($localPluginDir -replace '\\', '/')

$pnpmCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\DSH NEXT\resources\runtime\x64\primary-runtime\dependencies\pnpm\bin\pnpm.mjs"),
    (Join-Path $env:LOCALAPPDATA "Programs\DSH NEXT\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.mjs"),
    (Join-Path $env:ProgramFiles "DSH NEXT\resources\runtime\x64\primary-runtime\dependencies\pnpm\bin\pnpm.mjs")
)
$pnpmPath = $pnpmCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

$installedViaPnpm = $false
if ($pnpmPath) {
    try {
        Write-Host "  -> 正在调用 DSH 内置包管理器执行本地 link 注册..." -ForegroundColor Gray
        $output = & node $pnpmPath add $linkSpec "--config.minimumReleaseAge=0" --dir $dshProfileDir 2>&1
        if ($LASTEXITCODE -eq 0) {
            $installedViaPnpm = $true
            Write-Host "  -> 已通过 DSH 内置包管理器建立原生 link 依赖 (支持界面无感秒级直删)。" -ForegroundColor Green
        }
    } catch {}
}

if (-not $installedViaPnpm) {
    if (Test-Path $dshPkgFile) {
        try {
            $pkgRaw = Get-Content -Path $dshPkgFile -Raw -Encoding UTF8
            $pkgRaw = $pkgRaw -replace '(?m)^\s*"dsh-connect-today"\s*:\s*"[^"]*",?\r?\n', ''
            $pkgContent = $pkgRaw | ConvertFrom-Json
            if (-not $pkgContent.dependencies) {
                $pkgContent | Add-Member -MemberType NoteProperty -Name "dependencies" -Value ([PSCustomObject]@{})
            }
            $pkgContent.dependencies | Add-Member -MemberType NoteProperty -Name "dsh-today" -Value $linkSpec -Force
            $updatedJson = $pkgContent | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($dshPkgFile, $updatedJson, $utf8NoBom)
            Write-Host "  -> 已将 dsh-today link 写入 package.json。" -ForegroundColor Green
        } catch {}
    }
    $targetSymlink = Join-Path $targetModulesDir "dsh-today"
    if (Test-Path $targetSymlink) {
        Remove-Item -Path $targetSymlink -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
    }
    cmd /c "cd /d `"$targetModulesDir`" && mklink /D dsh-today ..\..\..\..\dsh-plugins\src\dsh-today" 2>$null
    if (-not (Test-Path $targetSymlink)) {
        cmd /c "mklink /J `"$targetSymlink`" `"$localPluginDir`"" 2>$null
    }
}

# B. 检查并注入 cordis.yml
$cordisYmlFile = Join-Path $dshProfileDir "cordis.yml"
$patchSourceFile = Join-Path $scriptDir "cordis.patch.yml"

if (Test-Path $cordisYmlFile) {
    $existingYml = Get-Content -Path $cordisYmlFile -Raw -Encoding UTF8
    if ($existingYml -notmatch 'dsh-today') {
        $backupFile = "$cordisYmlFile.bak." + (Get-Date -Format 'yyyyMMddHHmmss')
        Copy-Item -Path $cordisYmlFile -Destination $backupFile
        Write-Host "  -> 已备份现有配置至: $backupFile" -ForegroundColor Gray
        
        $patchText = @"

# Today AI 模型桥接插件 (dsh-today)
dsh-today:
  region: cn
  enableNativeDeviceTools: true
  responseTimeoutMs: 120000
"@
        [System.IO.File]::AppendAllText($cordisYmlFile, $patchText, $utf8NoBom)
        Write-Host "  -> 已自动将 dsh-today 配置追加至 cordis.yml！" -ForegroundColor Green
    } else {
        Write-Host "  -> cordis.yml 中已存在 dsh-today 配置项，无需重复注入。" -ForegroundColor Green
    }
} else {
    Write-Host "  -> 未发现已有 cordis.yml，直接应用自带 cordis.patch.yml" -ForegroundColor Gray
    if (Test-Path $patchSourceFile) {
        Copy-Item -Path $patchSourceFile -Destination $cordisYmlFile -Force
        Write-Host "  -> 已生成初始化 cordis.yml 配置。" -ForegroundColor Green
    }
}

# 5. 执行运行自检 (Doctor)
Write-Host "[5/5] 正在执行插件运行环境诊断自检 (Doctor)..." -ForegroundColor Yellow
$binScript = Join-Path $localPluginDir "dist\src\bin.js"
if (Test-Path $binScript) {
    Write-Host "----------------------------------------------------------" -ForegroundColor Gray
    & node $binScript doctor
    Write-Host "----------------------------------------------------------" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "               dsh-today 插件安装部署完成!                " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "使用提示：" -ForegroundColor Cyan
Write-Host "1. 重启您的 DSH NEXT 客户端；" -ForegroundColor White
Write-Host "2. 在模型选择下拉框中，切换至 'Today CN / DeepSeek V4.1 Flash'；" -ForegroundColor White
Write-Host "3. 尽情体验 100% 显式双轨思考折叠气泡与自驱动 Auto-Pump 完整交付！" -ForegroundColor White
Write-Host ""
Read-Host "按回车键完成退出..."
