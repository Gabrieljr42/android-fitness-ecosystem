# ============================================================
#  build.ps1  -  Compila o Evolucao.apk (WebView) do ZERO.
#  Windows 10/11 + internet. Baixa JDK + Android SDK (~1 GB)
#  na primeira vez, dentro da pasta _toolchain (nao mexe no
#  seu sistema). Depois e so rodar de novo (fica em cache).
#
#  Como rodar (PowerShell, dentro desta pasta):
#     powershell -ExecutionPolicy Bypass -File build.ps1
# ============================================================

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- URLs (se alguma der 404, atualize aqui) ----
$JDK_URL      = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
$CMDLINE_URL  = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$BUILDTOOLS   = "34.0.0"
$PLATFORM     = "android-34"

$rootLong = Split-Path -Parent $MyInvocation.MyCommand.Path
# Algumas ferramentas Android no Windows falham com caminhos contendo
# caracteres acentuados (como "Área"). Usa o caminho curto 8.3 quando
# estiver disponível e mantém o caminho normal como fallback.
$shortRoot = & cmd.exe /d /c ('for %I in ("' + $rootLong + '") do @echo %~sI') | Select-Object -First 1
$root = if($shortRoot){ $shortRoot.ToString().Trim() } else { $rootLong }
Set-Location $root
$tc = Join-Path $root "_toolchain"
New-Item -ItemType Directory -Force $tc | Out-Null
$build = Join-Path $root "build"
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $build | Out-Null

function Say($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Green }

# ---------- 0. Testes Unitários ----------
if (Get-Command node -ErrorAction SilentlyContinue) {
  Say "Executando testes unitários..."
  & node "app\src\test\js\run_all.js"
  if ($LASTEXITCODE -ne 0) { throw "Testes unitários falharam! Build cancelado." }
} else {
  Write-Host "Node.js não encontrado no PATH; pulando testes unitários automatizados." -ForegroundColor Yellow
}

# ---------- 1. JDK 17 ----------
$jdkDir = Join-Path $tc "jdk17"
if(-not (Get-ChildItem -Recurse $jdkDir -Filter javac.exe -ErrorAction SilentlyContinue | Select-Object -First 1)){
  Say "Baixando JDK 17 (Temurin)... (~180 MB)"
  $jz = Join-Path $tc "jdk.zip"
  Invoke-WebRequest $JDK_URL -OutFile $jz
  Say "Extraindo JDK..."
  Remove-Item -Recurse -Force $jdkDir -ErrorAction SilentlyContinue
  Expand-Archive -Force $jz $jdkDir
}
$javac = (Get-ChildItem -Recurse $jdkDir -Filter javac.exe | Select-Object -First 1).FullName
if(-not $javac){ throw "javac nao encontrado apos extrair o JDK." }
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javac)
$env:PATH = "$($env:JAVA_HOME)\bin;$env:PATH"
Say "JAVA_HOME = $($env:JAVA_HOME)"

# ---------- 2. Android cmdline-tools + SDK ----------
$sdk = Join-Path $tc "android-sdk"
$latest = Join-Path $sdk "cmdline-tools\latest"
$sdkmanager = Join-Path $latest "bin\sdkmanager.bat"
if(-not (Test-Path $sdkmanager)){
  Say "Baixando Android command-line tools..."
  $cz = Join-Path $tc "cmdline.zip"
  Invoke-WebRequest $CMDLINE_URL -OutFile $cz
  Say "Extraindo cmdline-tools..."
  $tmp = Join-Path $tc "cmdline-tmp"
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  Expand-Archive -Force $cz $tmp
  New-Item -ItemType Directory -Force $latest | Out-Null
  Copy-Item -Recurse -Force (Join-Path $tmp "cmdline-tools\*") $latest
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

Say "Instalando pacotes do SDK (aceitando licencas)... (~180 MB)"
$acc = ("y`r`n" * 60)
$acc | & $sdkmanager --sdk_root="$sdk" --licenses | Out-Null
& $sdkmanager --sdk_root="$sdk" "platform-tools" "platforms;$PLATFORM" "build-tools;$BUILDTOOLS"
if($LASTEXITCODE -ne 0){ throw "sdkmanager falhou ao instalar pacotes." }

$bt         = Join-Path $sdk "build-tools\$BUILDTOOLS"
$androidJar = Join-Path $sdk "platforms\$PLATFORM\android.jar"
$aapt2      = Join-Path $bt "aapt2.exe"
$zipalign   = Join-Path $bt "zipalign.exe"
$apksigner  = Join-Path $bt "apksigner.bat"
$d8         = Join-Path $bt "d8.bat"

# ---------- 3. Recursos (aapt2) ----------
Say "Compilando recursos..."
& $aapt2 compile --dir "app\src\main\res" -o "build\res.zip"
if($LASTEXITCODE -ne 0){ throw "aapt2 compile falhou." }

Say "Linkando (gerando APK base com manifest + assets)..."
& $aapt2 link -o "build\app-unsigned.apk" -I "$androidJar" `
  --manifest "app\src\main\AndroidManifest.xml" `
  -A "app\src\main\assets" `
  --min-sdk-version 24 --target-sdk-version 29 `
  "build\res.zip"
if($LASTEXITCODE -ne 0){ throw "aapt2 link falhou." }

# ---------- 3b. corrige barras invertidas nos nomes dos assets (bug do aapt2 Windows) ----------
# O aapt2.exe do Windows grava os nomes dos assets com "\" dentro do APK.
# A WebView do Android so resolve paths com "/", entao os recursos
# (CSS/JS em subpastas) ficavam ilegiveis -> tela em branco.
# Patch BINARIO in-place: troca \ por / apenas nos campos de NOME dos
# Local File Headers e do Central Directory. Todos os demais bytes
# (dados, offsets, alinhamento para o zipalign) ficam intactos.
Say "Corrigindo caminhos dos assets (\\ -> /, patch in-place)..."
$origApk = (Resolve-Path "build\app-unsigned.apk").Path
$bytes  = [System.IO.File]::ReadAllBytes($origApk)
$LfhSig = [byte[]]@(0x50,0x4b,0x03,0x04)
$CdhSig = [byte[]]@(0x50,0x4b,0x01,0x02)
$BSlash = [byte]0x5c; $Slash = [byte]0x2f
$fixedCount = 0
$pos = 0
while(($pos = [Array]::IndexOf($bytes, $LfhSig[0], $pos)) -ge 0){
  # PK: verificar assinatura completa
  if(($pos + 3) -lt $bytes.Length -and $bytes[$pos+1] -eq 0x4b -and $bytes[$pos+2] -eq 0x03 -and $bytes[$pos+3] -eq 0x04){
    $nameLen = [BitConverter]::ToUInt16($bytes, $pos + 26)
    $extraLen = [BitConverter]::ToUInt16($bytes, $pos + 28)
    $no = $pos + 30
    for($i=0; $i -lt $nameLen; $i++){
      if($bytes[$no + $i] -eq $BSlash){ $bytes[$no + $i] = $Slash; $fixedCount++ }
    }
    $pos = $no + $nameLen + $extraLen
  } else { $pos++ }
}
$pos = 0
while(($pos = [Array]::IndexOf($bytes, $CdhSig[0], $pos)) -ge 0){
  if(($pos + 3) -lt $bytes.Length -and $bytes[$pos+1] -eq 0x4b -and $bytes[$pos+2] -eq 0x01 -and $bytes[$pos+3] -eq 0x02){
    $nameLen = [BitConverter]::ToUInt16($bytes, $pos + 28)
    $extraLen = [BitConverter]::ToUInt16($bytes, $pos + 30)
    $no = $pos + 46
    for($i=0; $i -lt $nameLen; $i++){
      if($bytes[$no + $i] -eq $BSlash){ $bytes[$no + $i] = $Slash; $fixedCount++ }
    }
    $pos = $no + $nameLen + $extraLen
  } else { $pos++ }
}
[System.IO.File]::WriteAllBytes($origApk, $bytes)
Say "Caminhos corrigidos: $fixedCount"

# ---------- 4. Java -> .class ----------
Say "Compilando Java..."
New-Item -ItemType Directory -Force "build\classes" | Out-Null
$javaSources = Get-ChildItem -Recurse "app\src\main\java" -Filter *.java | ForEach-Object { $_.FullName }
& $javac -source 8 -target 8 -nowarn -classpath "$androidJar" -d "build\classes" `
  -encoding UTF-8 `
  @javaSources
if($LASTEXITCODE -ne 0){ throw "javac falhou." }

# ---------- 5. .class -> classes.dex ----------
Say "Gerando dex..."
$classes = Get-ChildItem -Recurse "build\classes" -Filter *.class | ForEach-Object { $_.FullName }
& $d8 --release --min-api 24 --lib "$androidJar" --output "build" @classes
if($LASTEXITCODE -ne 0){ throw "d8 falhou." }

# ---------- 6. injeta classes.dex no APK ----------
Say "Empacotando dex..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apkPath = (Resolve-Path "build\app-unsigned.apk").Path
$zip = [System.IO.Compression.ZipFile]::Open($apkPath, 'Update')
try {
  $old = $zip.GetEntry("classes.dex"); if($old){ $old.Delete() }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path "build\classes.dex").Path, "classes.dex") | Out-Null
} finally { $zip.Dispose() }

# ---------- 7. zipalign ----------
Say "Alinhando..."
& $zipalign -f 4 "build\app-unsigned.apk" "build\app-aligned.apk"
if($LASTEXITCODE -ne 0){ throw "zipalign falhou." }

# ---------- 8. keystore + assinatura ----------
# Keystore PERSISTENTE (fora da pasta build/): se criasse um novo a cada build,
# o Android recusaria a atualizacao do app ("App nao instalado") pois a chave muda.
$ks = Join-Path $tc "debug.keystore"
if(-not (Test-Path $ks)){
  Say "Criando keystore de assinatura (primeira vez)..."
  & "$($env:JAVA_HOME)\bin\keytool.exe" -genkeypair -v -keystore $ks -storepass android -keypass android `
    -alias ak -dname "CN=Evolucao Treino" -keyalg RSA -keysize 2048 -validity 10000
  if($LASTEXITCODE -ne 0){ throw "keytool falhou." }
}
Say "Assinando APK..."
& $apksigner sign --ks $ks --ks-pass pass:android --key-pass pass:android --out "Evolucao.apk" "build\app-aligned.apk"
if($LASTEXITCODE -ne 0){ throw "apksigner falhou." }

Say "PRONTO!  ->  $(Join-Path $root 'Evolucao.apk')"
Write-Host "Passe o Evolucao.apk pro celular e instale (permita 'fontes desconhecidas')." -ForegroundColor Cyan
