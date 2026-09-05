[CmdletBinding()]
param(
    [string]$PhoneSerial,
    [string]$WearSerial
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\WearTools.ps1')

$adb = Get-AdbPath
Show-AdbDevices $adb
if ([string]::IsNullOrWhiteSpace($PhoneSerial) -or [string]::IsNullOrWhiteSpace($WearSerial)) {
    throw "Informe -PhoneSerial e -WearSerial explicitamente. Nenhum dispositivo foi alterado."
}
Assert-ExplicitSerial $adb $PhoneSerial
Assert-ExplicitSerial $adb $WearSerial
if (Test-IsWatch $adb $PhoneSerial) { throw "-PhoneSerial aponta para um relógio." }
if (-not (Test-IsWatch $adb $WearSerial)) { throw "-WearSerial não foi reconhecido como relógio." }

Write-Host "`n=== TELEFONE ==="
Show-DeviceIdentity $adb $PhoneSerial | Out-Null
Write-Host (Invoke-External $adb @('-s', $PhoneSerial, 'shell', 'pm', 'path', 'com.evolucao.treino') 20 -AllowFailure).StdOut

Write-Host "`n=== RELÓGIO ==="
Show-DeviceIdentity $adb $WearSerial | Out-Null
Write-Host (Invoke-External $adb @('-s', $WearSerial, 'shell', 'pm', 'path', 'com.evolucao.treino') 20 -AllowFailure).StdOut

foreach ($target in @(
    [pscustomobject]@{ Name = 'telefone'; Serial = $PhoneSerial },
    [pscustomobject]@{ Name = 'relógio'; Serial = $WearSerial }
)) {
    Write-Host "`n=== PACKAGE NO $($target.Name.ToUpperInvariant()) ==="
    $packageDump = Invoke-External $adb @('-s', $target.Serial, 'shell', 'dumpsys', 'package', 'com.evolucao.treino') 40 -AllowFailure
    $packageDump.StdOut -split "`r?`n" |
        Where-Object { $_ -match 'versionName|versionCode|firstInstallTime|lastUpdateTime|signing|path=' } |
        Select-Object -First 40 | ForEach-Object { Write-Host $_.Trim() }

    Write-Host "`n=== DATA LAYER NO $($target.Name.ToUpperInvariant()) ==="
    $services = Invoke-External $adb @('-s', $target.Serial, 'shell', 'dumpsys', 'activity', 'services', 'com.google.android.gms') 45 -AllowFailure
    $services.StdOut -split "`r?`n" |
        Where-Object { $_ -match '(?i)wear|evolucao|dataitem|node|capabilit' } |
        Select-Object -First 100 | ForEach-Object { Write-Host $_.Trim() }
}

Write-Host "`n=== LOGS EVOLUÇÃO (TELEFONE) ==="
$phoneLogs = Invoke-External $adb @('-s', $PhoneSerial, 'logcat', '-d', '-t', '500', 'EvolucaoWearMobile:D', 'EvolucaoWearListener:D', '*:S') 40 -AllowFailure
Write-Host $phoneLogs.StdOut

Write-Host "`n=== LOGS EVOLUÇÃO (RELÓGIO) ==="
$wearLogs = Invoke-External $adb @('-s', $WearSerial, 'logcat', '-d', '-t', '500', 'EvolucaoWearData:D', 'EvolucaoWearRepo:D', '*:S') 40 -AllowFailure
Write-Host $wearLogs.StdOut

Write-Host "`nDiagnóstico concluído sem apagar dados."
Write-Host "Teste funcional: abra o Evolução no telefone, selecione A/B/C, toque 'Sincronizar agora' no relógio e conclua uma série de teste."
