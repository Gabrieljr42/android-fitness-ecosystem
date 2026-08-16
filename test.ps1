# ============================================================
#  test.ps1 - Executa todos os testes unitários do workspace
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Say($m){ Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }

$failed = 0

# 1. Testes do Evolução Treino
Say "1/2 Executando testes de Evolução (Treino)..."
Push-Location (Join-Path $root "evolucao-android")
try {
    & node app/src/test/js/run_all.js
    if ($LASTEXITCODE -ne 0) { $failed++ }
} finally {
    Pop-Location
}

# 2. Testes do NutriTrack
Say "2/2 Executando testes de NutriTrack (Nutrição)..."
Push-Location (Join-Path $root "nutricao-android")
try {
    & node app/src/test/js/run_all.js
    if ($LASTEXITCODE -ne 0) { $failed++ }
} finally {
    Pop-Location
}

Write-Host ""
if ($failed -eq 0) {
    Write-Host "🎉 SUCESSO: Todos os testes unitários de ambos os apps passaram!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ FALHA: Foram encontrados erros em $failed conjunto(s) de testes." -ForegroundColor Red
    exit 1
}
