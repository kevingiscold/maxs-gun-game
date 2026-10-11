# Max's Gun Game - Windows installer.
#   irm https://github.com/__REPO__/releases/latest/download/install.ps1 | iex
# Downloads the installer, installs silently for this user (no admin needed),
# then opens the game.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads ~10x slower
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$url = 'https://github.com/__REPO__/releases/latest/download/MaxsGunGame-Setup.exe'
$setup = Join-Path $env:TEMP 'MaxsGunGame-Setup.exe'

Write-Host "Downloading Max's Gun Game..."
Get-Process 'Maxs Gun Game' -ErrorAction SilentlyContinue | Stop-Process -Force
Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing
Write-Host 'Installing...'
Start-Process -FilePath $setup -ArgumentList '/S' -Wait
Remove-Item $setup -ErrorAction SilentlyContinue

$app = Join-Path $env:LOCALAPPDATA 'Programs\maxs-gun-game\Maxs Gun Game.exe'
if (Test-Path $app) {
  Write-Host "Installed. Opening it now - next time it's in the Start menu as Max's Gun Game."
  Start-Process $app
} else {
  Write-Host "Installed - find Max's Gun Game in the Start menu."
}
