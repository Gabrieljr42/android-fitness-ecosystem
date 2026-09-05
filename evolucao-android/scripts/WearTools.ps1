Set-StrictMode -Version Latest

function ConvertTo-NativeArgument {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$TimeoutSeconds = 30,
        [switch]$AllowFailure
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Não foi possível iniciar: $FilePath" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        try { $process.Kill() } catch { }
        throw "Tempo limite de ${TimeoutSeconds}s excedido: $FilePath"
    }
    $stdout = $stdoutTask.Result.TrimEnd()
    $stderr = $stderrTask.Result.TrimEnd()
    $result = [pscustomobject]@{
        ExitCode = $process.ExitCode
        StdOut = $stdout
        StdErr = $stderr
    }
    if ($result.ExitCode -ne 0 -and -not $AllowFailure) {
        $detail = if ($stderr) { $stderr } else { $stdout }
        throw "Comando falhou (código $($result.ExitCode)): $FilePath`n$detail"
    }
    return $result
}

function Get-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-AdbPath {
    $root = Get-ProjectRoot
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ANDROID_SDK_ROOT) { $candidates.Add((Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe')) }
    if ($env:ANDROID_HOME) { $candidates.Add((Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe')) }
    $candidates.Add((Join-Path $root '_toolchain\android-sdk\platform-tools\adb.exe'))
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')) }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "adb.exe não encontrado. Instale Android SDK Platform Tools ou defina ANDROID_SDK_ROOT."
}

function Get-Aapt2Path {
    $root = Get-ProjectRoot
    $sdkRoots = New-Object System.Collections.Generic.List[string]
    if ($env:ANDROID_SDK_ROOT) { $sdkRoots.Add($env:ANDROID_SDK_ROOT) }
    if ($env:ANDROID_HOME) { $sdkRoots.Add($env:ANDROID_HOME) }
    $sdkRoots.Add((Join-Path $root '_toolchain\android-sdk'))
    if ($env:LOCALAPPDATA) { $sdkRoots.Add((Join-Path $env:LOCALAPPDATA 'Android\Sdk')) }
    foreach ($sdk in $sdkRoots) {
        $buildTools = Join-Path $sdk 'build-tools'
        if (-not (Test-Path -LiteralPath $buildTools -PathType Container)) { continue }
        $candidate = Get-ChildItem -LiteralPath $buildTools -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
            ForEach-Object { Join-Path $_.FullName 'aapt2.exe' } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
        if ($candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    throw "aapt2.exe não encontrado; não é possível confirmar o package do APK."
}

function Show-AdbDevices {
    param([Parameter(Mandatory = $true)][string]$Adb)
    $result = Invoke-External $Adb @('devices', '-l') 20
    Write-Host "Dispositivos vistos pelo adb:"
    Write-Host $result.StdOut
}

function Assert-ExplicitSerial {
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [string]$Serial
    )
    Show-AdbDevices $Adb
    if ([string]::IsNullOrWhiteSpace($Serial)) {
        throw "Informe explicitamente -Serial. Copie o identificador mostrado por 'adb devices -l'."
    }
    $state = Invoke-External $Adb @('-s', $Serial, 'get-state') 15 -AllowFailure
    if ($state.ExitCode -ne 0 -or $state.StdOut.Trim() -ne 'device') {
        throw "O serial '$Serial' não está pronto. Estado/erro: $($state.StdOut) $($state.StdErr)"
    }
}

function Get-DeviceProperty {
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return (Invoke-External $Adb @('-s', $Serial, 'shell', 'getprop', $Name) 15).StdOut.Trim()
}

function Test-IsWatch {
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial
    )
    $characteristics = Get-DeviceProperty $Adb $Serial 'ro.build.characteristics'
    if ($characteristics -match '(^|,)watch(,|$)') { return $true }
    $features = Invoke-External $Adb @('-s', $Serial, 'shell', 'pm', 'list', 'features') 20 -AllowFailure
    return $features.StdOut -match 'android\.hardware\.type\.watch'
}

function Show-DeviceIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial
    )
    $model = Get-DeviceProperty $Adb $Serial 'ro.product.model'
    $sdk = Get-DeviceProperty $Adb $Serial 'ro.build.version.sdk'
    $release = Get-DeviceProperty $Adb $Serial 'ro.build.version.release'
    $characteristics = Get-DeviceProperty $Adb $Serial 'ro.build.characteristics'
    Write-Host "Serial: $Serial"
    Write-Host "Modelo: $model"
    Write-Host "Android/Wear: $release (API $sdk)"
    Write-Host "Características: $characteristics"
    return [pscustomobject]@{ Model = $model; Sdk = $sdk; Release = $release; Characteristics = $characteristics }
}

function Assert-ApkPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Apk,
        [string]$ExpectedPackage = 'com.evolucao.treino',
        [string]$ExpectedActivity,
        [switch]$RequireWatch,
        [switch]$ForbidWatch
    )
    if ($RequireWatch -and $ForbidWatch) { throw "Use apenas -RequireWatch ou -ForbidWatch." }
    if (-not (Test-Path -LiteralPath $Apk -PathType Leaf)) { throw "APK não encontrado: $Apk" }
    $resolved = (Resolve-Path -LiteralPath $Apk).Path
    $aapt2 = Get-Aapt2Path
    $dump = Invoke-External $aapt2 @('dump', 'xmltree', '--file', 'AndroidManifest.xml', $resolved) 30
    if ($dump.StdOut -notmatch ('package="' + [regex]::Escape($ExpectedPackage) + '"')) {
        throw "O APK não declara o package esperado '$ExpectedPackage': $resolved"
    }
    if ($ExpectedActivity -and $dump.StdOut -notmatch [regex]::Escape($ExpectedActivity)) {
        throw "O APK não declara a activity esperada '$ExpectedActivity': $resolved"
    }
    $hasWatchFeature = $dump.StdOut -match 'android\.hardware\.type\.watch'
    if ($RequireWatch -and -not $hasWatchFeature) {
        throw "O APK informado não é o artefato Wear (feature watch ausente): $resolved"
    }
    if ($ForbidWatch -and $hasWatchFeature) {
        throw "O APK informado é o artefato Wear; use o APK mobile neste dispositivo: $resolved"
    }
    Write-Host "APK confirmado: $resolved"
    Write-Host "Package confirmado: $ExpectedPackage"
    if ($ExpectedActivity) { Write-Host "Activity confirmada: $ExpectedActivity" }
    return $resolved
}

function Install-ApkSafely {
    param(
        [Parameter(Mandatory = $true)][string]$Adb,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$Apk
    )
    $result = Invoke-External $Adb @('-s', $Serial, 'install', '-r', $Apk) 180
    Write-Host $result.StdOut
    $packagePath = Invoke-External $Adb @('-s', $Serial, 'shell', 'pm', 'path', 'com.evolucao.treino') 20
    if ($packagePath.StdOut -notmatch '^package:') {
        throw "A instalação terminou, mas o package com.evolucao.treino não foi localizado no dispositivo."
    }
    Write-Host "Instalação verificada: $($packagePath.StdOut)"
}
