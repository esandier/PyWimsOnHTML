# Ouvre une page de tests dans Edge sans interface (profil vierge, sans extension), attend
# l’attribut data-done de <body>, puis affiche le nombre de résultats et les échecs.
# Usage : python pilote_edge.py URL [CHEMIN_EDGE]
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket  # paquet « websocket-client »

DEFAULT_EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
PORT = 9334
TIMEOUT_SECONDS = 600

# Renvoie les lignes de résultat une fois la page terminée, sinon null.
RESULTS = """(() => document.body && document.body.dataset.done === 'true'
  ? [...document.querySelectorAll('#results li')].map(li => li.textContent) : null)()"""


def find_edge(argument):
    for path in [argument] + DEFAULT_EDGE_PATHS:
        if path and os.path.exists(path):
            return path
    raise SystemExit("Edge est introuvable : indiquez son chemin en second argument.")


def main():
    url = sys.argv[1]
    edge = find_edge(sys.argv[2] if len(sys.argv) > 2 else None)
    # Un profil vierge évite les extensions de filtrage qui bloquent le téléchargement des paquets Pyodide.
    profile = tempfile.mkdtemp(prefix="pywims-edge-")
    browser = subprocess.Popen([
        edge, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
        f"--user-data-dir={profile}", "--disable-extensions", "--no-first-run", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2)
                break
            except OSError:
                time.sleep(0.25)
        request = urllib.request.Request(f"http://127.0.0.1:{PORT}/json/new?{url}", method="PUT")
        target = json.loads(urllib.request.urlopen(request, timeout=5).read())
        connection = websocket.create_connection(
            target["webSocketDebuggerUrl"], timeout=60, suppress_origin=True
        )
        results = None
        message_id = 0
        deadline = time.time() + TIMEOUT_SECONDS
        while time.time() < deadline and results is None:
            message_id += 1
            connection.send(json.dumps({
                "id": message_id, "method": "Runtime.evaluate",
                "params": {"expression": RESULTS, "returnByValue": True},
            }))
            while True:
                message = json.loads(connection.recv())
                if message.get("id") == message_id:
                    results = message["result"].get("result", {}).get("value")
                    break
            if results is None:
                time.sleep(1)
        if results is None:
            print("Délai dépassé : les tests ne se sont pas terminés.")
            return 1
        failed = [line for line in results if line.startswith("ÉCHEC")]
        print(f"{len(results)} résultats, {len(failed)} échec(s)")
        for line in failed:
            print(line)
        return 1 if failed else 0
    finally:
        browser.terminate()
        browser.wait(timeout=10)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
