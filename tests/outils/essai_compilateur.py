# Essai de bout en bout de l’interface du compilateur, dans Edge sans interface : ouverture d’un dossier
# d’exercices, liste, aperçu avec un tirage réel, compilation et fichier téléchargé. Le compilateur lit
# les fichiers du projet en ligne, à côté de lui : l’URL doit être servie depuis la racine du projet.
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


def dossier_d_exercices(destination):
    """Copie dans un dossier d’exercices les seuls exercices de la racine d’exercises/ : les
    sous-dossiers contiennent du contenu personnel, que les tests ne vérifient pas (le compilateur
    les liste aussi, et l’essai dépendrait de leur contenu). Renvoie les noms des exercices copiés."""
    exercices = sorted(nom for nom in os.listdir(os.path.join(PROJECT, "exercises")) if nom.endswith(".pwq"))
    for nom in exercices:
        shutil.copy(os.path.join(PROJECT, "exercises", nom), os.path.join(destination, nom))
    return exercices


# Dossier mémorisé de Chrome et Edge (SPECIFICATION.md, § 11.2). La fenêtre native de choix de dossier
# ne peut pas être pilotée : showDirectoryPicker est remplacée par un vrai dossier, pris dans l’espace
# de fichiers privé du site (OPFS), qui se lit, se relit et se mémorise comme un dossier du disque.
ECRIRE_OPFS = """async ([chemin, texte]) => {
  let dossier = await navigator.storage.getDirectory();
  const parties = chemin.split('/');
  for (const partie of parties.slice(0, -1)) dossier = await dossier.getDirectoryHandle(partie, { create: true });
  const fichier = await dossier.getFileHandle(parties.at(-1), { create: true });
  const ecriture = await fichier.createWritable();
  await ecriture.write(texte);
  await ecriture.close();
}"""
CHOISIR_OPFS = """async () => {
  const racine = await navigator.storage.getDirectory();
  const dossier = await racine.getDirectoryHandle('exercices-essai');
  window.showDirectoryPicker = async () => dossier;
}"""
TITRES = "items => items.map(li => li.querySelector('.exercise-title').textContent)"


def dossier_memorise(page, fichiers):
    for nom, texte in fichiers.items():
        # Un exercice dans un sous-dossier : il est lu aussi.
        chemin = f"exercices-essai/{'sous-dossier/' if nom.startswith('pgcd') else ''}{nom}"
        page.evaluate(ECRIRE_OPFS, [chemin, texte])
    page.evaluate(CHOISIR_OPFS)
    page.fill("#exercise-search", "")
    page.click("#choose-folder")
    page.wait_for_function("document.getElementById('folder-name').textContent === 'exercices-essai'")
    page.wait_for_function("document.querySelectorAll('#exercise-list li').length === 2")
    if page.is_hidden("#reload-folder"):
        raise AssertionError("« Relire » n’apparaît pas pour un dossier ouvert par Chrome ou Edge.")
    print("dossier mémorisé : ouvert, sous-dossier compris")

    # Fichier modifié, puis « Relire » : le nouveau titre apparaît, la sélection est gardée.
    decim = fichiers["Decim3.pwq"]
    ancien_titre = decim.split("% title\n%\n", 1)[1].split("\n", 1)[0]
    page.click(".exercise-selection >> nth=1")
    page.evaluate(ECRIRE_OPFS, ["exercices-essai/Decim3.pwq", decim.replace(ancien_titre, "Titre relu")])
    page.click("#reload-folder")
    page.wait_for_function("[...document.querySelectorAll('.exercise-title')].some(t => t.textContent === 'Titre relu')")
    if sum(page.evaluate("[...document.querySelectorAll('.exercise-selection')].map(c => c.checked)")) != 1:
        raise AssertionError("« Relire » a perdu la sélection.")
    print("relire : fichier modifié pris en compte, sélection gardée")

    # Fichier modifié sans « Relire » : la compilation relit l’exercice et compile sa dernière version.
    page.evaluate(ECRIRE_OPFS, ["exercices-essai/Decim3.pwq", decim.replace(ancien_titre, "Titre compilé")])
    for case in page.query_selector_all(".exercise-selection"):
        if case.is_checked():
            case.uncheck()
    titres = page.eval_on_selector_all("#exercise-list li", TITRES)
    page.click(f".exercise-selection >> nth={titres.index('Titre relu')}")
    with page.expect_download(timeout=180_000) as attente:
        page.click("#compile-exercise")
    if "Titre compilé" not in open(attente.value.path(), encoding="utf-8").read():
        raise AssertionError("La compilation n’a pas relu l’exercice modifié.")
    print("compilation : exercice relu, dernière version compilée")

    # Visite suivante : le dossier se rouvre d’un clic.
    page.reload()
    page.wait_for_function("document.getElementById('choose-folder').textContent === 'Rouvrir « exercices-essai »'")
    page.evaluate("() => { delete window.showDirectoryPicker; }")
    page.click("#choose-folder")
    page.wait_for_function("document.querySelectorAll('#exercise-list li').length === 2")
    print("visite suivante : « Rouvrir « exercices-essai » » rouvre le dossier")


# Firefox et Safari, imités dans Edge sans showDirectoryPicker : sélecteur classique, nom du dernier
# dossier rappelé, et fichier modifié après l’ouverture signalé à la compilation.
def sans_dossier_memorise(browser, url, dossier):
    page = browser.new_page(accept_downloads=True)
    page.add_init_script("delete window.showDirectoryPicker;")
    page.goto(url)
    page.wait_for_function("!!window.PyWimsCompiler")
    page.set_input_files("#exercise-folder", dossier)
    page.wait_for_function("document.querySelectorAll('#exercise-list li').length > 0")
    if not page.is_hidden("#reload-folder"):
        raise AssertionError("« Relire » ne devrait pas apparaître sans accès durable au dossier.")
    page.reload()
    nom = os.path.basename(dossier)
    page.wait_for_function(f"document.getElementById('folder-name').textContent === 'Dernier dossier : {nom}'")
    page.set_input_files("#exercise-folder", dossier)
    page.wait_for_function("document.querySelectorAll('#exercise-list li').length > 0")
    with open(os.path.join(dossier, "Decim3.pwq"), "a", encoding="utf-8") as fichier:
        fichier.write("\n")
    page.fill("#exercise-search", "Valeur approchée")
    page.click(".exercise-selection >> nth=0")
    page.click("#compile-exercise")
    page.wait_for_function("document.getElementById('messages').classList.contains('error')", timeout=180_000)
    if "a changé depuis l’ouverture du dossier" not in page.text_content("#messages"):
        raise AssertionError(f"message inattendu : {page.text_content('#messages')}")
    page.close()
    print("sans dossier mémorisé : dernier dossier rappelé, fichier modifié signalé")


def main():
    url = sys.argv[1]
    dossier = tempfile.mkdtemp(prefix="pywims-exercices-")
    erreurs = []
    try:
        exercises = dossier_d_exercices(dossier)
        with sync_playwright() as playwright:
            browser = lancer_edge(playwright, sys.argv[2] if len(sys.argv) > 2 else None)
            try:
                page = browser.new_page(accept_downloads=True)
                page.on("pageerror", lambda error: erreurs.append(str(error)))
                page.goto(url)
                page.wait_for_function("!!window.PyWimsCompiler", timeout=30_000)

                # Python se charge dès l’ouverture, sans attendre un aperçu ou une compilation.
                page.wait_for_function("PyWimsPython.isLoaded()", timeout=180_000)
                print("Python préchargé dès l’ouverture de la page")

                # Ouverture du dossier : la liste montre chaque exercice par son titre et ses champs.
                page.set_input_files("#exercise-folder", dossier)
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

                # « Tout sélectionner » n’agit que sur les exercices visibles, puis devient « Tout désélectionner ».
                # Seul le premier exercice est coché (compilé ci-dessus) ; « matrice » en montre d’autres.
                coches = "[...document.querySelectorAll('.exercise-selection')].map(c => c.checked)"
                page.fill("#exercise-search", "matrice")
                visibles = len(page.evaluate(coches))
                if not visibles or any(page.evaluate(coches)):
                    raise AssertionError("La recherche « matrice » devait montrer des exercices non cochés.")
                page.click("#select-visible")
                if not all(page.evaluate(coches)) or page.text_content("#select-visible") != "Tout désélectionner":
                    raise AssertionError("« Tout sélectionner » n’a pas coché les exercices visibles.")
                page.fill("#exercise-search", "")
                if sum(page.evaluate(coches)) != visibles + 1 or page.text_content("#select-visible") != "Tout sélectionner":
                    raise AssertionError(f"Les exercices masqués ont changé d’état : {page.evaluate(coches)}")
                page.click("#select-visible")
                if not all(page.evaluate(coches)):
                    raise AssertionError("« Tout sélectionner » n’a pas coché tous les exercices.")
                page.click("#select-visible")
                if any(page.evaluate(coches)):
                    raise AssertionError("« Tout désélectionner » n’a pas décoché les exercices.")
                print("tout sélectionner / désélectionner : exercices visibles seulement")

                # Une question sans « apres » : la compilation lit le module pywims et le script du
                # Worker pour ses tirages, mais le fichier n’en contient aucun (il ne charge pas Python).
                page.fill("#exercise-search", "Valeur approchée")
                page.click(".exercise-selection >> nth=0")
                with page.expect_download(timeout=180_000) as attente:
                    page.click("#compile-exercise")
                sans_python = open(attente.value.path(), encoding="utf-8").read()
                if ('id="pywims-worker"></script>' not in sans_python or
                        'id="pywims-module"></script>' not in sans_python):
                    raise AssertionError("Une question sans « apres » intègre le module ou le script du Worker.")
                print(f"question sans « apres » : ni module ni Worker intégrés ({len(sans_python) // 1024} Ko)")

                dossier_memorise(page, {nom: open(os.path.join(dossier, nom), encoding="utf-8").read()
                                        for nom in ("Decim3.pwq", "pgcd.pwq")})
                # Erreurs JavaScript de la page principale seulement : la page sans mémoire a les siennes.
                sans_dossier_memorise(browser, url, dossier)

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
