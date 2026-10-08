# Lance les tests du projet : page des tests rapides, cycle de vie avec un Python simulé, puis tests
# Python avec le vrai Pyodide, qui comprennent le balayage des tirages de chaque exercice.
# Prérequis : Edge, Python avec le paquet « websocket-client » (pilotage d’Edge).
# Usage : .\tests\outils\lancer-tests.ps1 [-SansPyodide] [-Tirages 200]
#   -Tirages : tirages balayés par exercice (20 par défaut ; 200 pour un balayage complet, plus lent).
param(
  [switch]$SansPyodide,
  [int]$Tirages = 20
)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$port = 8765
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# Le serveur de test sert aussi la liste du dossier exercises/, d’où les tests Python tirent les exercices.
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
    "== Tests Python avec Pyodide, balayage de $Tirages tirages par exercice (tests/python-tests.html)"
    python -I -X utf8 "$PSScriptRoot\pilote_edge.py" "http://127.0.0.1:$port/tests/python-tests.html?tirages=$Tirages"
    if ($LASTEXITCODE) { $failed = $true }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
