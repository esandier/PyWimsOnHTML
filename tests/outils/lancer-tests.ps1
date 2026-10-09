# Lance les tests du projet : page des tests rapides, cycle de vie avec un Python simulé, puis tests
# Python avec le vrai Pyodide, qui comprennent le balayage des tirages de chaque question.
# Prérequis : Edge, Python avec le paquet « playwright » (pilotage d’Edge, voir navigateur.py).
# Usage : .\tests\outils\lancer-tests.ps1 [-SansPyodide] [-Draws 200]
#   -Draws : tirages balayés par question (20 par défaut ; 200 pour un balayage complet, plus lent).
param(
  [switch]$SansPyodide,
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
  python -I -X utf8 "$PSScriptRoot\pilote_edge.py" "http://127.0.0.1:$port/tests/compiler-tests.html"
  if ($LASTEXITCODE) { $failed = $true }
  "== Cycle de vie d’une question, Python simulé (tests/runtime-tests.html)"
  python -I -X utf8 "$PSScriptRoot\pilote_edge.py" "http://127.0.0.1:$port/tests/runtime-tests.html"
  if ($LASTEXITCODE) { $failed = $true }
  if (-not $SansPyodide) {
    "== Tests Python avec Pyodide, balayage de $Draws tirages par question (tests/python-tests.html)"
    python -I -X utf8 "$PSScriptRoot\pilote_edge.py" "http://127.0.0.1:$port/tests/python-tests.html?draws=$Draws"
    if ($LASTEXITCODE) { $failed = $true }
    # L’interface du compilateur, de bout en bout : elle aussi a besoin de Pyodide (aperçu, compilation).
    "== Interface du compilateur : dossier, liste, aperçu, compilation (tests/outils/essai_compilateur.py)"
    python -I -X utf8 "$PSScriptRoot\essai_compilateur.py" "http://127.0.0.1:$port/compiler/index.html"
    if ($LASTEXITCODE) { $failed = $true }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
