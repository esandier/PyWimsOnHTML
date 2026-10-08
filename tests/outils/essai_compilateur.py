# Essai de bout en bout de l’interface du compilateur, dans Edge sans interface : ouverture du dossier
# du projet, liste des exercices, aperçu avec un tirage réel, compilation et fichier téléchargé.
# C’est la seule partie du projet que les pages de tests ne couvrent pas : elles appellent les
# fonctions du compilateur, mais pas sa page. Le sélecteur de dossier ne peut pas être cliqué par un
# programme ; Playwright lui donne le dossier (set_input_files), comme un choix de l’utilisateur.
# Prérequis : pip install playwright (voir navigateur.py).
# Usage : python essai_compilateur.py URL_DU_COMPILATEUR [CHEMIN_D’EDGE]
# Code de sortie : 0 si tout est bon, 1 sinon.
import os
import shutil
import sys
import tempfile

from playwright.sync_api import Error as ErreurPlaywright
from playwright.sync_api import sync_playwright

# python -I (lancer-tests.ps1) n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from navigateur import lancer_edge  # noqa: E402

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Dossiers du projet que lit le compilateur, en plus des exercices.
RESSOURCES = ["css", "layouts", "runtime", "widgets"]


def copie_du_projet(destination):
    """Copie le projet avec les seuls exercices de la racine d’exercises/ : les sous-dossiers
    contiennent du contenu personnel, que les tests ne vérifient pas (le compilateur les liste
    aussi, et l’essai dépendrait de leur contenu). Renvoie les noms des exercices copiés."""
    for nom in RESSOURCES:
        shutil.copytree(os.path.join(PROJECT, nom), os.path.join(destination, nom))
    os.mkdir(os.path.join(destination, "exercises"))
    exercices = sorted(nom for nom in os.listdir(os.path.join(PROJECT, "exercises")) if nom.endswith(".pwq"))
    for nom in exercices:
        shutil.copy(os.path.join(PROJECT, "exercises", nom), os.path.join(destination, "exercises", nom))
    return exercices


def main():
    url = sys.argv[1]
    dossier = tempfile.mkdtemp(prefix="pywims-projet-")
    erreurs = []
    try:
        exercises = copie_du_projet(dossier)
        with sync_playwright() as playwright:
            browser = lancer_edge(playwright, sys.argv[2] if len(sys.argv) > 2 else None)
            try:
                page = browser.new_page(accept_downloads=True)
                page.on("pageerror", lambda error: erreurs.append(str(error)))
                page.goto(url)
                page.wait_for_function("!!window.PyWimsCompiler", timeout=30_000)

                # Ouverture du dossier : la liste montre chaque exercice par son titre et ses champs.
                page.set_input_files("#project-folder", dossier)
                page.wait_for_function("document.querySelectorAll('#exercise-list li').length > 0", timeout=30_000)
                items = page.eval_on_selector_all(
                    "#exercise-list li",
                    "items => items.map(li => [li.querySelector('.exercise-title').textContent, "
                    "li.querySelector('.exercise-fields').textContent])")
                if len(items) != len(exercises) or any(not title or not kinds for title, kinds in items):
                    raise AssertionError(f"liste inattendue : {items} pour {exercises}")
                print(f"liste : {len(items)} exercices, avec titre et types de champs")

                # Aperçu du premier exercice : provisoire, puis un tirage réel calculé par Python.
                page.click(".exercise-preview-button >> nth=0")
                page.wait_for_function(
                    "document.getElementById('preview-frame').srcdoc.includes('pw-question') && "
                    "!document.getElementById('preview-notice').textContent.startsWith('Aperçu provisoire') && "
                    "!document.getElementById('preview-notice').classList.contains('error')",
                    timeout=180_000)
                print("aperçu : tirage réel affiché")

                # Compilation de cet exercice : un fichier HTML autonome est téléchargé.
                page.click(".exercise-selection >> nth=0")
                with page.expect_download(timeout=180_000) as attente:
                    page.click("#compile-exercise")
                telechargement = attente.value
                message = page.text_content("#messages")
                if "téléchargée" not in message:
                    raise AssertionError(f"compilation en échec : {message}")
                if not telechargement.suggested_filename.endswith(".html"):
                    raise AssertionError(f"fichier téléchargé inattendu : {telechargement.suggested_filename}")
                html = open(telechargement.path(), encoding="utf-8").read()
                if 'class="pw-question"' not in html or "data-draws" not in html:
                    raise AssertionError(f"{telechargement.suggested_filename} ne contient pas de question compilée")
                print(f"compilation : {telechargement.suggested_filename} téléchargé ({len(html) // 1024} Ko)")
            finally:
                browser.close()

        if erreurs:
            raise AssertionError(f"erreurs JavaScript : {erreurs}")
        print("aucune erreur JavaScript")
        return 0
    # Une vérification fausse, un délai dépassé ou un élément introuvable (page cassée) : échec lisible.
    except (AssertionError, ErreurPlaywright) as error:
        print(f"ÉCHEC : {error}")
        if erreurs:
            print(f"erreurs JavaScript : {erreurs}")
        return 1
    finally:
        shutil.rmtree(dossier, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
