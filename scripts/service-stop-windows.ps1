$ErrorActionPreference = 'Stop'

$TaskName = 'OpenCauseComputeWorker'
Stop-ScheduledTask -TaskName $TaskName
Write-Host "Stopped scheduled task: $TaskName"
