$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js is required. Install Node 20+ first.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm is required. Install npm first.'
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Error 'ollama is required for Local LLM v1 extraction. Install ollama first.'
}

Write-Host 'Installing dependencies...'
npm install

Write-Host 'Building project...'
npm run build

Write-Host 'Running tests...'
npm run test

Write-Host 'Ensuring local model is available...'
$Model = if ($env:LOCAL_LLM_MODEL) { $env:LOCAL_LLM_MODEL } else { 'llama3.2:3b' }
ollama pull $Model

Write-Host 'Installation complete.'
Write-Host 'Next steps:'
Write-Host '  1) npm run start:web'
Write-Host '  2) npm run demo:seed'
Write-Host '  3) npm run start:worker:loop'
Write-Host ''
Write-Host 'Optional persistent service:'
Write-Host '  npm run service:install:windows'
