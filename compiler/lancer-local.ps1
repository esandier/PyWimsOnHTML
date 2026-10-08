# Lance le compilateur en local : un serveur à la racine du projet, puis le compilateur dans le
# navigateur. Sert à essayer une modification du moteur (runtime/, widgets/, css/…) avant de la
# publier ; pour compiler ses exercices, la version en ligne suffit.
# Pourquoi un serveur : ouvert depuis le disque (file://), le compilateur ne peut pas lire les
# fichiers du projet, que le navigateur refuse de lui donner (SPECIFICATION.md, § 11.1).
# Prérequis : Python (son module http.server). Usage : .\compiler\lancer-local.ps1 [-Port 8800]
# Fichier enregistré en UTF-8 avec BOM : sans lui, Windows PowerShell 5.1 lit les accents de travers.
param(
  [int]$Port = 8800
)

# Le port doit être vraiment libre. Sous Windows, le serveur de Python (SO_REUSEADDR) ouvre sans
# erreur un port déjà pris, par exemple le 8000 d’un serveur Django : le navigateur parlait alors à
# l’autre serveur, qui répondait 404. Un TcpListener exclusif, lui, échoue si le port est occupé.
function Test-PortLibre([int]$numero) {
  try {
    $ecoute = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $numero)
    $ecoute.ExclusiveAddressUse = $true
    $ecoute.Start()
    $ecoute.Stop()
    return $true
  } catch {
    return $false
  }
}

$depart = $Port
while (-not (Test-PortLibre $Port)) {
  $Port += 1
  if ($Port -gt $depart + 20) {
    throw "Aucun port libre entre $depart et $Port."
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
