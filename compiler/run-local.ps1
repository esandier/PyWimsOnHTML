# Lance le compilateur en local : un serveur à la racine du projet, puis le compilateur dans le
# navigateur. Sert à essayer une modification du moteur (runtime/, widgets/, css/…) avant de la
# publier ; pour compiler ses questions, la version en ligne suffit.
# Pourquoi un serveur : ouvert depuis le disque (file://), le compilateur ne peut pas lire les
# fichiers du projet, que le navigateur refuse de lui donner (SPECIFICATION.md, § 11.1).
# Prérequis : Python (son module http.server). Usage : .\compiler\run-local.ps1 [-Port 8800]
# Fichier enregistré en UTF-8 avec BOM : sans lui, Windows PowerShell 5.1 lit les accents de travers.
param(
  [int]$Port = 8800
)

# Le port doit être vraiment libre. Sous Windows, le serveur de Python (SO_REUSEADDR) ouvre sans
# erreur un port déjà pris, par exemple le 8000 d’un serveur Django : le navigateur parlait alors à
# l’autre serveur, qui répondait 404. Un TcpListener exclusif, lui, échoue si le port est occupé.
function Test-FreePort([int]$number) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $number)
    $listener.ExclusiveAddressUse = $true
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

$firstPort = $Port
while (-not (Test-FreePort $Port)) {
  $Port += 1
  if ($Port -gt $firstPort + 20) {
    throw "Aucun port libre entre $firstPort et $Port."
  }
}

$root = (Resolve-Path "$PSScriptRoot\..").Path
$server = Start-Process python -ArgumentList "-m", "http.server", "$Port", "--bind", "127.0.0.1" `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Milliseconds 800
  if ($server.HasExited) {
    throw "Le serveur n’a pas démarré sur le port $Port."
  }
  Start-Process "http://127.0.0.1:$Port/compiler/"
  Write-Host "Compilateur : http://127.0.0.1:$Port/compiler/ (dossier servi : $root)"
  Read-Host "Appuyez sur Entrée pour arrêter le serveur"
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
