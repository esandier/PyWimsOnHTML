# Recompile les démonstrations de l’accueil (demos/) avec le vrai compilateur, à partir des exercices
# de la racine d’exercises/ et de la charte neutre (SPECIFICATION.md, § 11.6) : l’exemple de deux
# questions, intégré à l’accueil, et la feuille de tous les exercices. À lancer
# avant de publier une modification du moteur : les démonstrations intègrent le moteur du moment.
# Prérequis : Python avec playwright (voir navigateur.py).
# Usage : python tests/outils/demos.py
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

# python -I n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from navigateur import lancer_edge  # noqa: E402

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEMOS = os.path.join(PROJECT, "demos")
FEUILLE = "PyWimsOnHTML : feuille de démonstration"
EXEMPLE = "Exemple d’activité"
# Un choix multiple à retours ciblés, puis une réponse écrite corrigée par Python ; on a écarté la
# formule (input_math) : dans le cadre de l’accueil, son clavier s’ouvrirait au bas du cadre.
QUESTIONS_EXEMPLE = ["Reconnaître des nombres premiers", "Addition de fractions"]


def port_libre():
    with socket.socket() as essai:
        essai.bind(("127.0.0.1", 0))
        return essai.getsockname()[1]


def compiler(page, titres, destination, titre_activite=None):
    """Coche les exercices de ces titres, dans cet ordre, et enregistre le fichier compilé."""
    for case in page.query_selector_all(".exercise-selection"):
        if case.is_checked():
            case.uncheck()
    liste = page.eval_on_selector_all("#exercise-list li:not(.exercise-group)",
                                      "items => items.map(li => li.querySelector('.exercise-title').textContent)")
    for titre in titres:
        page.click(f".exercise-selection >> nth={liste.index(titre)}")
    if titre_activite:
        page.select_option("#output-mode", "activity")
        page.fill("#activity-title", titre_activite)
    with page.expect_download(timeout=600_000) as attente:
        page.click("#compile-exercise")
    attente.value.save_as(destination)
    print(f"{os.path.relpath(destination, PROJECT)} : {os.path.getsize(destination) // 1024} Ko")


def main():
    # Dossier d’exercices : les seuls .pwq de la racine, sans brand.css (charte neutre).
    dossier = tempfile.mkdtemp(prefix="pywims-demos-")
    for nom in os.listdir(os.path.join(PROJECT, "exercises")):
        if nom.endswith(".pwq"):
            shutil.copy(os.path.join(PROJECT, "exercises", nom), dossier)
    port = port_libre()
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                               cwd=PROJECT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(0.8)
        os.makedirs(DEMOS, exist_ok=True)
        with sync_playwright() as playwright:
            navigateur = lancer_edge(playwright)
            page = navigateur.new_page(accept_downloads=True)
            page.goto(f"http://127.0.0.1:{port}/compiler/")
            page.set_input_files("#exercise-folder", dossier)
            page.wait_for_function("document.querySelectorAll('.exercise-selection').length > 0")
            if "Charte neutre" not in page.text_content("#brand-status"):
                raise SystemExit("Les démonstrations doivent utiliser la charte neutre.")
            # La feuille : tous les exercices, dans l’ordre de la liste (titres).
            tous = page.eval_on_selector_all("#exercise-list li:not(.exercise-group)",
                                             "items => items.map(li => li.querySelector('.exercise-title').textContent)")
            compiler(page, tous, os.path.join(DEMOS, "feuille.html"), FEUILLE)
            compiler(page, QUESTIONS_EXEMPLE, os.path.join(DEMOS, "exemple.html"), EXEMPLE)
            navigateur.close()
    finally:
        serveur.terminate()
        shutil.rmtree(dossier, ignore_errors=True)


if __name__ == "__main__":
    main()
