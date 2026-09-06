[CmdletBinding()]
param(
    [switch]$MobileOnly,
    [switch]$WearOnly,
    [switch]$WithTests,
    [switch]$WithLint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($MobileOnly -and $WearOnly) { throw "Use apenas -MobileOnly ou -WearOnly." }

$projectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$driveLetter = $null
foreach ($candidate in @('R','S','T','U','V','W','X','Y','Z')) {
    if (-not (Get-PSDrive -Name $candidate -ErrorAction SilentlyContinue)) {
        $driveLetter = $candidate
        break
    }
}
if (-not $driveLetter) { throw "Nenhuma letra R:-Z: está livre para contornar o caminho com acento." }

$oldJavaHome = $env:JAVA_HOME
$oldAndroidSdkRoot = $env:ANDROID_SDK_ROOT
$oldGradleUserHome = $env:GRADLE_USER_HOME
$oldLocation = Get-Location
$mapped = "$driveLetter`:"

try {
    & subst.exe $mapped $projectRoot
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar unidade temporária $mapped para $projectRoot" }
    Set-Location "$mapped\"
    $jdk = Get-ChildItem -LiteralPath "$mapped\_toolchain\jdk17" -Directory |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $jdk) { throw "JDK 17 local não encontrado em _toolchain\jdk17." }
    $env:JAVA_HOME = $jdk.FullName
    $env:ANDROID_SDK_ROOT = "$mapped\_toolchain\android-sdk"
    if ([string]::IsNullOrWhiteSpace($env:GRADLE_USER_HOME)) {
        $standardGradleHome = if ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.gradle' } else { $null }
        $env:GRADLE_USER_HOME = if ($standardGradleHome -and (Test-Path -LiteralPath $standardGradleHome)) {
            $standardGradleHome
        } else {
            "$mapped\_toolchain\gradle-home"
        }
    }

    $tasks = New-Object System.Collections.Generic.List[string]
    if (-not $WearOnly) { $tasks.Add(':app:assembleDebug') }
    if (-not $MobileOnly) { $tasks.Add(':wear:assembleDebug') }
    if ($WithTests) {
        $tasks.Insert(0, ':protocol:testDebugUnitTest')
        if (-not $WearOnly) { $tasks.Insert(1, ':app:testDebugUnitTest') }
        if (-not $MobileOnly) { $tasks.Insert(1, ':wear:testDebugUnitTest') }
    }
    if ($WithLint) {
        if (-not $WearOnly) { $tasks.Add(':app:lintDebug') }
        if (-not $MobileOnly) { $tasks.Add(':wear:lintDebug') }
    }

    Write-Host "Executando Gradle: $($tasks -join ' ')"
    & .\gradlew.bat --no-daemon @tasks
    if ($LASTEXITCODE -ne 0) { throw "Build Gradle falhou com código $LASTEXITCODE." }

    if ($WithTests -and -not $WearOnly) {
        Write-Host "Executando regressão JavaScript completa..."
        # Node não precisa da unidade temporária (só o Gradle/JDK têm problema
        # com o acento no caminho): roda pelo caminho real, pois vários testes
        # sobem até a raiz do repo via __dirname e quebrariam sob R:\.
        & node (Join-Path $projectRoot 'app\src\test\js\run_all.js')
        if ($LASTEXITCODE -ne 0) { throw "A regressão JavaScript falhou com código $LASTEXITCODE." }
    }
} finally {
    Set-Location $oldLocation
    $env:JAVA_HOME = $oldJavaHome
    $env:ANDROID_SDK_ROOT = $oldAndroidSdkRoot
    $env:GRADLE_USER_HOME = $oldGradleUserHome
    if ($driveLetter) { & subst.exe $mapped /d | Out-Null }
}

if (-not $WearOnly) {
    Write-Host "APK mobile: $(Join-Path $projectRoot 'app\build\outputs\apk\debug\app-debug.apk')"
}
if (-not $MobileOnly) {
    Write-Host "APK Wear:   $(Join-Path $projectRoot 'wear\build\outputs\apk\debug\wear-debug.apk')"
}
