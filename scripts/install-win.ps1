# 安装前请先关闭 Cursor / VS Code，避免 node_modules 文件被占用
# 以管理员 PowerShell 运行：Set-ExecutionPolicy -Scope Process Bypass; .\scripts\install-win.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ">> 结束可能占用 node 的进程..."
Get-Process node, esbuild, pnpm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if (Test-Path "node_modules") {
  Write-Host ">> 删除 node_modules（可能需要 1-2 分钟）..."
  cmd /c "rmdir /s /q node_modules"
}

if (Test-Path "node_modules") {
  Write-Error "无法删除 node_modules，请关闭 Cursor/杀毒软件后重试"
}

Write-Host ">> 安装依赖（copy 模式，降低 Windows EBUSY 概率）..."
pnpm install

if ($LASTEXITCODE -ne 0) {
  Write-Error "pnpm install 失败。可尝试将项目目录加入 Windows Defender 排除项后重试。"
}

Write-Host ">> 完成！运行: pnpm dev"
