$ErrorActionPreference = 'Stop'

$TaskName = 'OpenCauseComputeWorker'
$RootDir = Split-Path -Parent $PSScriptRoot
$CoordinatorUrl = if ($env:COORDINATOR_URL) { $env:COORDINATOR_URL } else { 'http://localhost:3000' }
$IntervalMs = if ($env:WORKER_INTERVAL_MS) { $env:WORKER_INTERVAL_MS } else { '5000' }

$Command = "Set-Location '$RootDir'; `$env:COORDINATOR_URL='$CoordinatorUrl'; `$env:WORKER_INTERVAL_MS='$IntervalMs'; npm run start -w @opencause/worker -- loop --server $CoordinatorUrl --interval-ms $IntervalMs"
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -Command \"$Command\""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started scheduled task: $TaskName"
