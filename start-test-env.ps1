# start-test-env.ps1
# 启动防火墙配置审计台测试环境。
# 使用方法：在项目根目录运行 `./start-test-env.ps1` 或 `./start-test-env.ps1`。

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-Not (Test-Path package.json)) {
    Write-Error "当前目录没有找到 package.json，请在项目根目录运行此脚本。"
    exit 1
}

if (-Not (Test-Path node_modules)) {
    Write-Host "检测到 node_modules 不存在，正在安装依赖..."
    npm install
}

$port = 8081
$listenHost = '0.0.0.0'

Write-Host "启动开发服务器..."
Write-Host "访问地址： http://localhost:$port"
Write-Host "如果需要局域网访问，请使用主机 IP 地址："
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notmatch '^169\.'
} | ForEach-Object {
    Write-Host "  http://$($_.IPAddress):$port"
}

npm run dev -- --host $listenHost --port $port
