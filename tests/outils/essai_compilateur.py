# Essai de bout en bout de l’interface du compilateur, dans Edge sans interface : ouverture du dossier
# du projet, liste des exercices, aperçu avec un tirage réel, compilation et fichier téléchargé.
# C’est la seule partie du projet que les pages de tests ne couvrent pas : elles appellent les
# fonctions du compilateur, mais pas sa page. Le sélecteur de dossier ne peut pas être cliqué par un
# programme ; le protocole de pilotage (DOM.setFileInputFiles) lui donne le dossier, comme un choix
# de l’utilisateur.
# Prérequis : Edge, Python avec le paquet « websocket-client ».
# Usage : python essai_compilateur.py URL_DU_COMPILATEUR [CHEMIN_D’EDGE]
# Code de sortie : 0 si tout est bon, 1 sinon.
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

DEFAULT_EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
# Port différent de celui de pilote_edge.py : les deux outils ne se gênent pas.
PORT = 9336
PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def find_edge(argument):
    for path in [argument] + DEFAULT_EDGE_PATHS:
        if path and os.path.exists(path):
            return path
    raise SystemExit("Edge est introuvable : indiquez son chemin en second argument.")


class Page:
    """Onglet piloté par le protocole de débogage d’Edge ; note les erreurs JavaScript de la page."""

    def __init__(self, socket):
        self.socket = socket
        self.counter = 0
        self.errors = []

    def call(self, method, **params):
        self.counter += 1
        self.socket.send(json.dumps({"id": self.counter, "method": method, "params": params}))
        while True:
            message = json.loads(self.socket.recv())
            if message.get("method") == "Runtime.exceptionThrown":
                details = message["params"]["exceptionDetails"]
                self.errors.append(details.get("exception", {}).get("description", details.get("text", "?")))
            if message.get("id") == self.counter:
                if "error" in message:
                    raise RuntimeError(f"{method} : {message['error']}")
                return message.get("result", {})

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        return result.get("result", {}).get("value")

    def wait(self, expression, description, timeout):
        end = time.time() + timeout
        while time.time() < end:
            if self.evaluate(expression):
                return
            time.sleep(0.5)
        raise AssertionError(f"délai dépassé : {description}")


def main():
    url = sys.argv[1]
    edge = find_edge(sys.argv[2] if len(sys.argv) > 2 else None)
    # Profil vierge : une extension de filtrage du profil habituel bloque les paquets Pyodide.
    profile = tempfile.mkdtemp(prefix="pywims-essai-")
    downloads = tempfile.mkdtemp(prefix="pywims-telechargements-")
    browser = subprocess.Popen([edge, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
                                f"--user-data-dir={profile}", "--no-first-run", "about:blank"])
    page = None
    try:
        for _ in range(40):
            try:
                version = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2).read())
                break
            except OSError:
                time.sleep(0.25)
        else:
            raise SystemExit("Edge ne répond pas au protocole de pilotage.")
        request = urllib.request.Request(f"http://127.0.0.1:{PORT}/json/new?about:blank", method="PUT")
        target = json.loads(urllib.request.urlopen(request, timeout=5).read())
        page = Page(websocket.create_connection(target["webSocketDebuggerUrl"], timeout=120, suppress_origin=True))
        # Les téléchargements de la page arrivent dans un dossier temporaire, effacé à la fin.
        Page(websocket.create_connection(version["webSocketDebuggerUrl"], timeout=30, suppress_origin=True)).call(
            "Browser.setDownloadBehavior", behavior="allow", downloadPath=downloads)
        page.call("Runtime.enable")
        page.call("DOM.enable")
        page.call("Page.navigate", url=url)
        page.wait("document.readyState === 'complete' && !!window.PyWimsCompiler", "chargement du compilateur", 30)

        # Ouverture du dossier du projet : la liste montre chaque exercice par son titre et ses champs.
        root = page.call("DOM.getDocument")["root"]["nodeId"]
        picker = page.call("DOM.querySelector", nodeId=root, selector="#project-folder")["nodeId"]
        page.call("DOM.setFileInputFiles", nodeId=picker, files=[PROJECT])
        page.wait("document.querySelectorAll('#exercise-list li').length > 0", "liste des exercices", 30)
        exercises = sorted(name for name in os.listdir(os.path.join(PROJECT, "exercises")) if name.endswith(".pwq"))
        items = page.evaluate("[...document.querySelectorAll('#exercise-list li')].map(li => "
                              "[li.querySelector('.exercise-title').textContent, li.querySelector('.exercise-fields').textContent])")
        if len(items) != len(exercises) or any(not title or not kinds for title, kinds in items):
            raise AssertionError(f"liste inattendue : {items} pour {exercises}")
        print(f"liste : {len(items)} exercices, avec titre et types de champs")

        # Aperçu du premier exercice : provisoire, puis un tirage réel calculé par Python.
        page.evaluate("document.querySelector('.exercise-preview-button').click()")
        page.wait("document.getElementById('preview-frame').srcdoc.includes('pw-question') && "
                  "!document.getElementById('preview-notice').textContent.startsWith('Aperçu provisoire') && "
                  "!document.getElementById('preview-notice').classList.contains('error')",
                  "aperçu avec un tirage réel", 180)
        print("aperçu : tirage réel affiché")

        # Compilation de cet exercice : un fichier HTML autonome est téléchargé.
        page.evaluate("document.querySelector('.exercise-selection').click()")
        page.evaluate("document.getElementById('compile-exercise').click()")
        page.wait("/téléchargée|error/.test(document.getElementById('messages').textContent + "
                  "document.getElementById('messages').className)", "fin de la compilation", 180)
        message = page.evaluate("document.getElementById('messages').textContent")
        if "téléchargée" not in message:
            raise AssertionError(f"compilation en échec : {message}")
        end = time.time() + 15
        files = []
        while time.time() < end:
            files = [name for name in os.listdir(downloads) if name.endswith(".html")]
            if files:
                break
            time.sleep(0.5)
        if len(files) != 1:
            raise AssertionError(f"fichiers téléchargés inattendus : {os.listdir(downloads)}")
        html = open(os.path.join(downloads, files[0]), encoding="utf-8").read()
        if 'class="pw-question"' not in html or "data-draws" not in html:
            raise AssertionError(f"{files[0]} ne contient pas de question compilée")
        print(f"compilation : {files[0]} téléchargé ({len(html) // 1024} Ko)")

        if page.errors:
            raise AssertionError(f"erreurs JavaScript : {page.errors}")
        print("aucune erreur JavaScript")
        return 0
    # Une vérification fausse, ou un élément introuvable par le pilotage (page cassée) : échec lisible.
    except (AssertionError, RuntimeError) as error:
        print(f"ÉCHEC : {error}")
        if page and page.errors:
            print(f"erreurs JavaScript : {page.errors}")
        return 1
    finally:
        browser.kill()
        browser.wait(timeout=10)
        shutil.rmtree(downloads, ignore_errors=True)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
