$ErrorActionPreference = 'Stop'

$TaskName = 'OpenCauseComputeWorker'
Start-ScheduledTask -TaskName $TaskName
Write-Host "Started scheduled task: $TaskName"
