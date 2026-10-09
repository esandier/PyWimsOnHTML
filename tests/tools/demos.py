# Recompile les démonstrations de l’accueil (demos/) avec le vrai compilateur, à partir des questions
# de la racine de questions/ et de la charte neutre (SPECIFICATION.md, § 11.6) : l’exemple de deux
# questions, intégré à l’accueil, et la feuille de toutes les questions. À lancer
# avant de publier une modification du moteur : les démonstrations intègrent le moteur du moment.
# Prérequis : Python avec playwright (voir edge.py).
# Usage : python tests/tools/demos.py
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
from edge import launch_edge  # noqa: E402

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEMOS = os.path.join(PROJECT, "demos")
SHEET = "PyWimsOnHTML : feuille de démonstration"
EXAMPLE = "Exemple d’activité"
# Un choix multiple à retours ciblés, puis une réponse écrite corrigée par Python ; on a écarté la
# formule (input_math) : dans le cadre de l’accueil, son clavier s’ouvrirait au bas du cadre.
EXAMPLE_QUESTIONS = ["Reconnaître des nombres premiers", "Addition de fractions"]


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def compile_selection(page, titles, destination, activity_title=None):
    """Coche les questions de ces titres, dans cet ordre, et enregistre le fichier compilé."""
    for checkbox in page.query_selector_all(".question-selection"):
        if checkbox.is_checked():
            checkbox.uncheck()
    listed = page.eval_on_selector_all("#question-list li:not(.question-group)",
                                      "items => items.map(li => li.querySelector('.question-title').textContent)")
    for title in titles:
        page.click(f".question-selection >> nth={listed.index(title)}")
    if activity_title:
        page.select_option("#output-mode", "activity")
        page.fill("#activity-title", activity_title)
    with page.expect_download(timeout=600_000) as waiting:
        page.click("#compile-question")
    waiting.value.save_as(destination)
    print(f"{os.path.relpath(destination, PROJECT)} : {os.path.getsize(destination) // 1024} Ko")


def main():
    # Dossier de questions : les seuls .pwq de la racine, sans brand.css (charte neutre).
    folder = tempfile.mkdtemp(prefix="pywims-demos-")
    for name in os.listdir(os.path.join(PROJECT, "questions")):
        if name.endswith(".pwq"):
            shutil.copy(os.path.join(PROJECT, "questions", name), folder)
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                               cwd=PROJECT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(0.8)
        os.makedirs(DEMOS, exist_ok=True)
        with sync_playwright() as playwright:
            navigateur = launch_edge(playwright)
            page = navigateur.new_page(accept_downloads=True)
            page.goto(f"http://127.0.0.1:{port}/compiler/")
            page.set_input_files("#question-folder", folder)
            page.wait_for_function("document.querySelectorAll('.question-selection').length > 0")
            if "Charte neutre" not in page.text_content("#brand-status"):
                raise SystemExit("Les démonstrations doivent utiliser la charte neutre.")
            # La feuille : toutes les questions, dans l’ordre de la liste (titres).
            all_titles = page.eval_on_selector_all("#question-list li:not(.question-group)",
                                             "items => items.map(li => li.querySelector('.question-title').textContent)")
            compile_selection(page, all_titles, os.path.join(DEMOS, "sheet.html"), SHEET)
            compile_selection(page, EXAMPLE_QUESTIONS, os.path.join(DEMOS, "example.html"), EXAMPLE)
            navigateur.close()
    finally:
        server.terminate()
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
