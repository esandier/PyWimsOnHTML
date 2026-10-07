# Lance les tests du projet : page des tests rapides, page des tests Python (vrai Pyodide)
# et balayage des tirages avec le Python local.
# Prérequis : Edge, Python avec les paquets « websocket-client » et « sympy ».
# Usage : .\tests\outils\lancer-tests.ps1 [-SansPyodide] [-Tirages 200]
param(
  [switch]$SansPyodide,
  [int]$Tirages = 200
)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$port = 8765
[Console]::OutputEncoding = [Text.Encoding]::UTF8
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
    "== Tests Python avec Pyodide (tests/python-tests.html)"
    python -I -X utf8 "$PSScriptRoot\pilote_edge.py" "http://127.0.0.1:$port/tests/python-tests.html"
    if ($LASTEXITCODE) { $failed = $true }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
"== Balayage de $Tirages tirages par exercice"
python -I -X utf8 "$PSScriptRoot\balayage.py" $Tirages
if ($LASTEXITCODE) { $failed = $true }
if ($failed) { exit 1 }
