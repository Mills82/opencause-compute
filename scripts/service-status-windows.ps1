$ErrorActionPreference = 'Stop'

$TaskName = 'OpenCauseComputeWorker'
Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
