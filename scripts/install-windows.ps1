$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js is required. Install Node 20+ first.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm is required. Install npm first.'
}

Write-Host 'Installing dependencies...'
npm install

Write-Host 'Building project...'
npm run build

Write-Host 'Running tests...'
npm run test

Write-Host 'Installation complete.'
Write-Host 'Next steps:'
Write-Host '  1) npm run start:web'
Write-Host '  2) npm run demo:seed'
Write-Host '  3) npm run start:worker:loop'
Write-Host ''
Write-Host 'Optional persistent service:'
Write-Host '  npm run service:install:windows'
