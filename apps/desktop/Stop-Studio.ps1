[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = $(if ($env:STUDIO_PORT) { $env:STUDIO_PORT } else { 8765 }),
    [string]$DataDir = $env:STUDIO_DATA_DIR
)
$ErrorActionPreference = 'Stop'
$studioUrl = "http://127.0.0.1:$Port"
if (-not $DataDir) { $DataDir = Join-Path $PSScriptRoot 'data' }
$studioData = [IO.Path]::GetFullPath($DataDir)
function Test-SamePath([string]$First, [string]$Second) {
    if (-not $First -or -not $Second) { return $false }
    return [string]::Equals([IO.Path]::GetFullPath($First).TrimEnd('\'), [IO.Path]::GetFullPath($Second).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}
try { $studioHealth = Invoke-RestMethod -Uri "$studioUrl/api/health" -TimeoutSec 2 } catch { Write-Output 'Studio is not running.'; exit 0 }
if ($studioHealth.app -ne 'stm32-studio' -or -not (Test-SamePath $studioHealth.appDir $PSScriptRoot) -or -not (Test-SamePath $studioHealth.dataDir $studioData)) { throw 'Refusing to stop a different application, copy, or data directory. Pass the matching -Port and -DataDir.' }
$studioBootstrap = Invoke-RestMethod -Uri "$studioUrl/api/bootstrap" -TimeoutSec 5
Invoke-RestMethod -Uri "$studioUrl/api/shutdown" -Method Post -Headers @{ 'X-Local-Token' = $studioBootstrap.csrfToken; 'Origin' = $studioUrl } -ContentType 'application/json' -Body '{}' | Out-Null
for ($studioTry = 0; $studioTry -lt 40; $studioTry++) {
    Start-Sleep -Milliseconds 100
    try { $current = Invoke-RestMethod -Uri "$studioUrl/api/health" -TimeoutSec 1 } catch { $current = $null }
    if (-not $current -or $current.pid -ne $studioHealth.pid) {
        Write-Output 'Studio stopped. Your learning data is saved.'
        exit 0
    }
}
throw 'The shutdown request was accepted, but the service has not stopped yet. Wait for it to finish before restarting.'
