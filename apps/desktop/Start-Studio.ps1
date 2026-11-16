[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [string]$PythonPath = $env:STUDIO_PYTHON,
    [ValidateRange(1024, 65535)][int]$Port = $(if ($env:STUDIO_PORT) { $env:STUDIO_PORT } else { 8765 }),
    [string]$DataDir = $env:STUDIO_DATA_DIR
)
$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$studioUrl = "http://127.0.0.1:$Port"
if (-not $DataDir) { $DataDir = Join-Path $studioRoot 'data' }
$studioData = [IO.Path]::GetFullPath($DataDir)

function Test-SamePath([string]$First, [string]$Second) {
    if (-not $First -or -not $Second) { return $false }
    return [string]::Equals([IO.Path]::GetFullPath($First).TrimEnd('\'), [IO.Path]::GetFullPath($Second).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Assert-StudioIdentity($Health) {
    if ($Health.app -ne 'stm32-studio' -or -not (Test-SamePath $Health.appDir $studioRoot) -or -not (Test-SamePath $Health.dataDir $studioData)) {
        throw "Port $Port belongs to a different app, copy, or data directory. Stop that instance or choose another -Port."
    }
}

function Find-StudioPython {
    $candidates = @()
    if ($PythonPath) {
        $candidates += $PythonPath
    } else {
        # Optional local tools take precedence; no Codex runtime is required.
        $candidates += 'D:\DevTools\CodexAgentStack\.venv\Scripts\python.exe'
        foreach ($name in @('python.exe', 'python3.exe')) {
            $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($command -and $command.Source -notmatch '\\Microsoft\\WindowsApps\\') { $candidates += $command.Source }
        }
        $launcher = Get-Command 'py.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($launcher) {
            # Listing installed interpreters never requests a download or Store install.
            try {
                $installed = & $launcher.Source -0p 2>$null
                foreach ($line in $installed) {
                    if ($line -match '([A-Za-z]:\\.+?python(?:\d+(?:\.\d+)*)?\.exe)\s*$') { $candidates += $Matches[1] }
                }
            } catch { }
        }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        try {
            $command = Get-Command $candidate -CommandType Application -ErrorAction Stop | Select-Object -First 1
            $version = & $command.Source -I -B -c 'import sys; print(sys.executable); sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null
            if ($LASTEXITCODE -eq 0 -and $version) { return [string]($version | Select-Object -Last 1) }
        } catch { continue }
    }
    throw 'Python 3.10+ was not found. Install Python from python.org or pass -PythonPath / set STUDIO_PYTHON to an existing python.exe.'
}

function Get-StudioHealth {
    try { return Invoke-RestMethod -Uri "$studioUrl/api/health" -TimeoutSec 2 } catch { return $null }
}

$studioHealth = Get-StudioHealth
if ($studioHealth) {
    Assert-StudioIdentity $studioHealth
} else {
    $studioPython = Find-StudioPython
    $studioLogs = Join-Path $studioData 'logs'
    $studioTmp = Join-Path $studioData 'tmp'
    New-Item -ItemType Directory -Path $studioLogs,$studioTmp -Force | Out-Null
    $studioInstance = [Guid]::NewGuid().ToString('N')
    $studioVariables = @{ STUDIO_PORT = [string]$Port; STUDIO_DATA_DIR = $studioData; STUDIO_INSTANCE_ID = $studioInstance; TEMP = $studioTmp; TMP = $studioTmp; PYTHONDONTWRITEBYTECODE = '1' }
    $studioPrevious = @{}
    try {
        foreach ($name in $studioVariables.Keys) {
            $studioPrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $studioVariables[$name], 'Process')
        }
        $studioArgs = @('-B', ('"' + (Join-Path $studioRoot 'server.py') + '"'))
        $studioProcess = Start-Process -FilePath $studioPython -ArgumentList $studioArgs -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioLogs 'server.out.log') -RedirectStandardError (Join-Path $studioLogs 'server.err.log') -PassThru
    } finally {
        foreach ($name in $studioPrevious.Keys) { [Environment]::SetEnvironmentVariable($name, $studioPrevious[$name], 'Process') }
    }
    for ($studioTry = 0; $studioTry -lt 40; $studioTry++) {
        Start-Sleep -Milliseconds 250
        $studioHealth = Get-StudioHealth
        if ($studioHealth) {
            Assert-StudioIdentity $studioHealth
            # Virtual-environment redirectors may spawn a different Python PID.
            if ($studioHealth.instanceId -ne $studioInstance) { throw "Another process claimed port $Port while starting. Inspect $studioLogs." }
            break
        }
        if ($studioProcess.HasExited) { throw "The server exited. See $studioLogs\server.err.log." }
    }
    if (-not $studioHealth) { throw "The server did not become ready. See $studioLogs\server.err.log." }
}
if (-not $NoBrowser) { Start-Process $studioUrl }
Write-Output "Studio ready: $studioUrl"
Write-Output "App: $studioRoot"
Write-Output "Data: $studioData"
