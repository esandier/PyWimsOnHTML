# Lance le compilateur en local : un serveur à la racine du projet, puis le compilateur dans le
# navigateur. Sert à essayer une modification du moteur (runtime/, widgets/, css/…) avant de la
# publier ; pour compiler ses exercices, la version en ligne suffit.
# Pourquoi un serveur : ouvert depuis le disque (file://), le compilateur ne peut pas lire les
# fichiers du projet, que le navigateur refuse de lui donner (SPECIFICATION.md, § 11.1).
# Prérequis : Python (son module http.server). Usage : .\compiler\lancer-local.ps1 [-Port 8000]
param(
  [int]$Port = 8000
)

$root = (Resolve-Path "$PSScriptRoot\..").Path
$server = Start-Process python -ArgumentList "-m", "http.server", "$Port", "--bind", "127.0.0.1" `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Milliseconds 800
  if ($server.HasExited) {
    throw "Le serveur n’a pas démarré : le port $Port est peut-être déjà pris (essayez -Port 8001)."
  }
  Start-Process "http://127.0.0.1:$Port/compiler/"
  Write-Host "Compilateur : http://127.0.0.1:$Port/compiler/"
  Read-Host "Appuyez sur Entrée pour arrêter le serveur"
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
