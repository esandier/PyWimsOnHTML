# Lance les tests du projet : page des tests rapides, cycle de vie avec un Python simulé, puis tests
# Python avec le vrai Pyodide, qui comprennent le balayage des tirages de chaque question.
# Prérequis : Edge, Python avec le paquet « playwright » (pilotage d’Edge, voir edge.py).
# Usage : .\tests\tools\run-tests.ps1 [-Rapide] [-SkipPyodide] [-Draws 200]
#   -Rapide : tests rapides, cycle de vie et interface du compilateur (1 min 30 environ) ; sans le
#             balayage Python ni les barres de défilement. La suite complète (3 min 15 environ,
#             mesurées en novembre 2026) se lance avant de pousser ou après une retouche des styles.
#   -Draws : tirages balayés par question (20 par défaut ; 200 pour un balayage complet, plus lent).
param(
  [switch]$Rapide,
  [switch]$SkipPyodide,
  [int]$Draws = 20
)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$port = 8765
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# Le serveur de test sert aussi la liste du dossier questions/, d’où les tests Python tirent les questions.
$server = Start-Process python -ArgumentList "-m", "http.server", "$port", "--bind", "127.0.0.1" `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden
$failed = $false
try {
  Start-Sleep -Milliseconds 800
  "== Tests rapides (tests/compiler-tests.html)"
  python -I -X utf8 "$PSScriptRoot\run_test_page.py" "http://127.0.0.1:$port/tests/compiler-tests.html"
  if ($LASTEXITCODE) { $failed = $true }
  "== Cycle de vie d’une question, Python simulé (tests/runtime-tests.html)"
  python -I -X utf8 "$PSScriptRoot\run_test_page.py" "http://127.0.0.1:$port/tests/runtime-tests.html"
  if ($LASTEXITCODE) { $failed = $true }
  if (-not $SkipPyodide) {
    if (-not $Rapide) {
      "== Tests Python avec Pyodide, balayage de $Draws tirages par question (tests/python-tests.html)"
      python -I -X utf8 "$PSScriptRoot\run_test_page.py" "http://127.0.0.1:$port/tests/python-tests.html?draws=$Draws"
      if ($LASTEXITCODE) { $failed = $true }
    }
    # L’interface du compilateur, de bout en bout : elle aussi a besoin de Pyodide (aperçu, compilation).
    "== Interface du compilateur : dossier, liste, aperçu, compilation (tests/tools/compiler_e2e.py)"
    python -I -X utf8 "$PSScriptRoot\compiler_e2e.py" "http://127.0.0.1:$port/compiler/index.html"
    if ($LASTEXITCODE) { $failed = $true }
    if (-not $Rapide) {
      # Barres de défilement parasites et page plus large que l’écran, sur des activités exportées.
      "== Barres de défilement : zooms, largeurs, deux styles (tests/tools/scrollbars.py)"
      python -I -X utf8 "$PSScriptRoot\scrollbars.py" "http://127.0.0.1:$port/compiler/index.html"
      if ($LASTEXITCODE) { $failed = $true }
    }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
