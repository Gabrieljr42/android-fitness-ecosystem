[CmdletBinding()]
param(
    [string]$Serial,
    [string]$Apk,
    [switch]$Build,
    [switch]$NoLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\WearTools.ps1')

if ($Build) { & (Join-Path $PSScriptRoot 'build-wear.ps1') -MobileOnly }
if (-not $Apk) { $Apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk' }

$adb = Get-AdbPath
Assert-ExplicitSerial $adb $Serial
Show-DeviceIdentity $adb $Serial | Out-Null
if (Test-IsWatch $adb $Serial) {
    throw "Instalação recusada: o serial '$Serial' é um relógio. Use install-wear-debug.ps1 nele."
}
$resolvedApk = Assert-ApkPackage $Apk -ExpectedActivity 'com.evolucao.treino.MainActivity' -ForbidWatch
Install-ApkSafely $adb $Serial $resolvedApk

if (-not $NoLaunch) {
    $launch = Invoke-External $adb @('-s', $Serial, 'shell', 'am', 'start', '-n', 'com.evolucao.treino/com.evolucao.treino.MainActivity') 30
    Write-Host $launch.StdOut
}
Write-Host "Pronto. Abra o Evolução, selecione a ficha A/B/C e mantenha o relógio pareado pelo app Wear OS/Mobvoi."
