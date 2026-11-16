param([ValidateSet('debug','release')][string]$Mode='debug')
$ErrorActionPreference='Stop'
$studio='D:\Program Files\Huawei\DevEco Studio'
$env:JAVA_HOME=Join-Path $studio 'jbr'
$env:NODE_HOME=Join-Path $studio 'tools\node'
$env:DEVECO_SDK_HOME=Join-Path $studio 'sdk'
$env:HVIGOR_USER_HOME=Join-Path (Split-Path -Parent $PSScriptRoot) '.build-cache'
$env:npm_config_cache=Join-Path $env:HVIGOR_USER_HOME 'npm'
$env:PATH=$env:NODE_HOME+';'+(Join-Path $env:JAVA_HOME 'bin')+';'+$env:PATH
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  & (Join-Path $env:NODE_HOME 'node.exe') (Join-Path $studio 'tools\hvigor\bin\hvigorw.js') --mode module -p product=default -p module=entry@default -p buildMode=$Mode assembleHap --no-daemon
  if($LASTEXITCODE -ne 0){throw 'HarmonyOS build failed.'}
} finally { Pop-Location }
