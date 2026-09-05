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

if ($Build) { & (Join-Path $PSScriptRoot 'build-wear.ps1') -WearOnly }
if (-not $Apk) { $Apk = Join-Path $PSScriptRoot 'wear\build\outputs\apk\debug\wear-debug.apk' }

$adb = Get-AdbPath
Assert-ExplicitSerial $adb $Serial
$identity = Show-DeviceIdentity $adb $Serial
if (-not (Test-IsWatch $adb $Serial)) {
    throw "Instalação recusada: o serial '$Serial' não foi identificado como relógio Wear OS."
}
if ([int]$identity.Sdk -lt 26) {
    throw "O relógio usa API $($identity.Sdk), abaixo do minSdk 26 deste APK."
}
$resolvedApk = Assert-ApkPackage $Apk -ExpectedActivity 'com.evolucao.treino.wear.MainActivity' -RequireWatch
Install-ApkSafely $adb $Serial $resolvedApk

if (-not $NoLaunch) {
    $launch = Invoke-External $adb @('-s', $Serial, 'shell', 'am', 'start', '-n', 'com.evolucao.treino/com.evolucao.treino.wear.MainActivity') 30
    Write-Host $launch.StdOut
}
Write-Host "Pronto. Abra 'Evolução' no relógio; no telefone, selecione um treino e toque em sincronizar."
Write-Host "Para diagnosticar: .\diagnose-wear-sync.ps1 -PhoneSerial SERIAL_TELEFONE -WearSerial $Serial"
