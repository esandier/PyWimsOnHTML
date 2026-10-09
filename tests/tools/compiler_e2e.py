# Essai de bout en bout de l’interface du compilateur, dans Edge sans interface : ouverture d’un dossier
# de questions, liste, aperçu avec un tirage réel, compilation et fichier téléchargé. Le compilateur lit
# les fichiers du projet en ligne, à côté de lui : l’URL doit être servie depuis la racine du projet.
# C’est la seule partie du projet que les pages de tests ne couvrent pas : elles appellent les
# fonctions du compilateur, mais pas sa page. Le sélecteur de dossier ne peut pas être cliqué par un
# programme ; Playwright lui donne le dossier (set_input_files), comme un choix de l’utilisateur.
# Prérequis : pip install playwright (voir edge.py).
# Usage : python compiler_e2e.py URL_DU_COMPILATEUR [CHEMIN_D’EDGE]
# Code de sortie : 0 si tout est bon, 1 sinon.
import os
import shutil
import sys
import tempfile

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

# python -I (run-tests.ps1) n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edge import launch_edge  # noqa: E402

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def copy_root_questions(destination):
    """Copie dans un dossier de questions les seules questions de la racine de questions/ : les
    sous-dossiers contiennent du contenu personnel, que les tests ne vérifient pas (le compilateur
    les liste aussi, et l’essai dépendrait de leur contenu). Renvoie les noms des questions copiées."""
    questions = sorted(name for name in os.listdir(os.path.join(PROJECT, "questions")) if name.endswith(".pwq"))
    for name in questions:
        shutil.copy(os.path.join(PROJECT, "questions", name), os.path.join(destination, name))
    return questions


# Dossier mémorisé de Chrome et Edge (SPECIFICATION.md, § 11.2). La fenêtre native de choix de dossier
# ne peut pas être pilotée : showDirectoryPicker est remplacée par un vrai dossier, pris dans l’espace
# de fichiers privé du site (OPFS), qui se lit, se relit et se mémorise comme un dossier du disque.
WRITE_OPFS = """async ([path, text]) => {
  let folder = await navigator.storage.getDirectory();
  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
  const file = await folder.getFileHandle(parts.at(-1), { create: true });
  const writer = await file.createWritable();
  await writer.write(text);
  await writer.close();
}"""
PICK_OPFS = """async () => {
  const root = await navigator.storage.getDirectory();
  const folder = await root.getDirectoryHandle('questions-essai');
  window.showDirectoryPicker = async () => folder;
}"""
TITLES = "items => items.map(li => li.querySelector('.question-title').textContent)"


def remembered_folder(page, files):
    for name, text in files.items():
        # Une question dans un sous-dossier : elle est lue aussi.
        path = f"questions-essai/{'sous-dossier/' if name.startswith('pgcd') else ''}{name}"
        page.evaluate(WRITE_OPFS, [path, text])
    page.evaluate(PICK_OPFS)
    page.fill("#question-search", "")
    page.click("#choose-folder")
    page.wait_for_function("document.getElementById('folder-name').textContent === 'questions-essai'")
    page.wait_for_function("document.querySelectorAll('#question-list li:not(.question-group)').length === 2")
    if page.is_hidden("#reload-folder"):
        raise AssertionError("« Relire » n’apparaît pas pour un dossier ouvert par Chrome ou Edge.")
    # Liste regroupée : le dossier choisi d’abord, puis le sous-dossier sous son chemin (§ 11.3).
    groups = page.evaluate("[...document.querySelectorAll('#question-list li')].map(li => li.classList.contains('question-group') ? '# ' + li.textContent : li.querySelector('.question-title').textContent)")
    if len(groups) != 4 or groups[0] != "# questions-essai" or groups[2] != "# sous-dossier/" or groups[3] != "PGCD":
        raise AssertionError(f"liste regroupée inattendue : {groups}")
    print("dossier mémorisé : ouvert, sous-dossier compris, liste regroupée par dossier")

    # Fichier modifié, puis « Relire » : le nouveau titre apparaît, la sélection est gardée.
    decim_source = files["Decim3.pwq"]
    old_title = decim_source.split("% question_title\n%\n", 1)[1].split("\n", 1)[0]
    page.click(".question-selection >> nth=1")
    page.evaluate(WRITE_OPFS, ["questions-essai/Decim3.pwq", decim_source.replace(old_title, "Titre relu")])
    page.click("#reload-folder")
    page.wait_for_function("[...document.querySelectorAll('.question-title')].some(t => t.textContent === 'Titre relu')")
    if sum(page.evaluate("[...document.querySelectorAll('.question-selection')].map(c => c.checked)")) != 1:
        raise AssertionError("« Relire » a perdu la sélection.")
    print("relire : fichier modifié pris en compte, sélection gardée")

    # Fichier modifié sans « Relire » : la compilation relit la question et compile sa dernière version.
    page.evaluate(WRITE_OPFS, ["questions-essai/Decim3.pwq", decim_source.replace(old_title, "Titre compilé")])
    for checkbox in page.query_selector_all(".question-selection"):
        if checkbox.is_checked():
            checkbox.uncheck()
    titles = page.eval_on_selector_all("#question-list li:not(.question-group)", TITLES)
    page.click(f".question-selection >> nth={titles.index('Titre relu')}")
    with page.expect_download(timeout=180_000) as waiting:
        page.click("#compile-question")
    if "Titre compilé" not in open(waiting.value.path(), encoding="utf-8").read():
        raise AssertionError("La compilation n’a pas relu la question modifiée.")
    print("compilation : question relue, dernière version compilée")

    # Charte du dossier : un brand.css à sa racine remplace la charte neutre (§ 11.4).
    if "Charte neutre" not in page.text_content("#brand-status"):
        raise AssertionError(f"charte annoncée : {page.text_content('#brand-status')}")
    page.evaluate(WRITE_OPFS, ["questions-essai/brand.css", ":root { --pw-brand-primary: #123456; }"])
    page.click("#reload-folder")
    page.wait_for_function("document.getElementById('brand-status').textContent.includes('brand.css du dossier')")
    with page.expect_download(timeout=180_000) as waiting:
        page.click("#compile-question")
    branded = open(waiting.value.path(), encoding="utf-8").read()
    if "--pw-brand-primary: #123456" not in branded or "--pw-brand-primary: #2f5d7c" in branded:
        raise AssertionError("Le fichier compilé n’utilise pas le brand.css du dossier.")
    print("charte du dossier : annoncée et intégrée au fichier compilé")

    # Ordre d’une activité (§ 11.9) : celui des cases cochées, changé par « ↓ » sur la question choisie,
    # gardé par « Relire », et suivi par le fichier compilé.
    for checkbox in page.query_selector_all(".question-selection"):
        if checkbox.is_checked():
            checkbox.uncheck()
    page.click(".question-selection >> nth=1")  # PGCD, dans le sous-dossier
    page.click(".question-selection >> nth=0")  # Decim3, à la racine
    page.select_option("#output-mode", "activity")
    page.fill("#activity-title", "Activité ordonnée")
    order_script = "[...document.querySelectorAll('#activity-order-list .order-title')].map(b => b.textContent)"
    ranks = "[...document.querySelectorAll('#question-list .question-rank')].map(r => r.textContent)"
    if page.evaluate(order_script) != ["PGCD", "Titre compilé"] or page.evaluate(ranks) != ["2", "1"]:
        raise AssertionError(f"ordre des cases cochées non suivi : {page.evaluate(order_script)}, rangs {page.evaluate(ranks)}")
    page.click(".order-title >> text=PGCD")
    page.click("#move-down")
    if page.evaluate(order_script) != ["Titre compilé", "PGCD"]:
        raise AssertionError(f"« ↓ » n’a pas déplacé la question choisie : {page.evaluate(order_script)}")
    # Arrivée en fin, « ↓ » est inactif : le focus passe à « ↑ ».
    if not page.is_disabled("#move-down") or page.evaluate("document.activeElement.id") != "move-up":
        raise AssertionError("En fin de liste, « ↓ » devait être inactif et le focus passer à « ↑ ».")
    page.click("#reload-folder")
    page.wait_for_function("document.getElementById('project-status').textContent.includes('chargé')")
    if page.evaluate(order_script) != ["Titre compilé", "PGCD"] or page.evaluate(ranks) != ["1", "2"]:
        raise AssertionError(f"« Relire » n’a pas gardé l’ordre : {page.evaluate(order_script)}, rangs {page.evaluate(ranks)}")
    with page.expect_download(timeout=180_000) as waiting:
        page.click("#compile-question")
    activity = open(waiting.value.path(), encoding="utf-8").read()
    if not 0 <= activity.find("Titre compilé") < activity.find(">PGCD<"):
        raise AssertionError("Le fichier compilé ne suit pas l’ordre choisi.")
    page.select_option("#output-mode", "separate")
    if page.is_visible("#activity-order") or any(page.evaluate(ranks)):
        raise AssertionError("En pages séparées, la liste d’ordre et les rangs devraient être masqués.")
    print("ordre d’une activité : cases cochées, « ↓ », gardé par « Relire », suivi à la compilation")

    # Visite suivante : le dossier se rouvre d’un clic.
    page.reload()
    page.wait_for_function("document.getElementById('choose-folder').textContent === 'Rouvrir « questions-essai »'")
    page.evaluate("() => { delete window.showDirectoryPicker; }")
    page.click("#choose-folder")
    page.wait_for_function("document.querySelectorAll('#question-list li:not(.question-group)').length === 2")
    print("visite suivante : « Rouvrir « questions-essai » » rouvre le dossier")


# Firefox et Safari, imités dans Edge sans showDirectoryPicker : sélecteur classique, nom du dernier
# dossier rappelé, et fichier modifié après l’ouverture signalé à la compilation.
def without_remembered_folder(browser, url, folder):
    page = browser.new_page(accept_downloads=True)
    page.add_init_script("delete window.showDirectoryPicker;")
    page.goto(url)
    page.wait_for_function("!!window.PyWimsCompiler")
    page.set_input_files("#question-folder", folder)
    page.wait_for_function("document.querySelectorAll('#question-list li:not(.question-group)').length > 0")
    if not page.is_hidden("#reload-folder"):
        raise AssertionError("« Relire » ne devrait pas apparaître sans accès durable au dossier.")
    page.reload()
    name = os.path.basename(folder)
    page.wait_for_function(f"document.getElementById('folder-name').textContent === 'Dernier dossier : {name}'")
    page.set_input_files("#question-folder", folder)
    page.wait_for_function("document.querySelectorAll('#question-list li:not(.question-group)').length > 0")
    with open(os.path.join(folder, "Decim3.pwq"), "a", encoding="utf-8") as file:
        file.write("\n")
    page.fill("#question-search", "Valeur approchée")
    page.click(".question-selection >> nth=0")
    page.click("#compile-question")
    page.wait_for_function("document.getElementById('messages').classList.contains('error')", timeout=180_000)
    if "a changé depuis l’ouverture du dossier" not in page.text_content("#messages"):
        raise AssertionError(f"message inattendu : {page.text_content('#messages')}")
    page.close()
    print("sans dossier mémorisé : dernier dossier rappelé, fichier modifié signalé")


def main():
    url = sys.argv[1]
    folder = tempfile.mkdtemp(prefix="pywims-questions-")
    errors = []
    try:
        questions = copy_root_questions(folder)
        with sync_playwright() as playwright:
            browser = launch_edge(playwright, sys.argv[2] if len(sys.argv) > 2 else None)
            try:
                page = browser.new_page(accept_downloads=True)
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(url)
                page.wait_for_function("!!window.PyWimsCompiler", timeout=30_000)

                # Python se charge dès l’ouverture, sans attendre un aperçu ou une compilation.
                page.wait_for_function("PyWimsPython.isLoaded()", timeout=180_000)
                print("Python préchargé dès l’ouverture de la page")

                # Ouverture du dossier : la liste montre chaque question par son titre et ses champs.
                page.set_input_files("#question-folder", folder)
                page.wait_for_function("document.querySelectorAll('#question-list li:not(.question-group)').length > 0", timeout=30_000)
                items = page.eval_on_selector_all(
                    "#question-list li:not(.question-group)",
                    "items => items.map(li => [li.querySelector('.question-title').textContent, "
                    "li.querySelector('.question-fields').textContent])")
                if len(items) != len(questions) or any(not title or not kinds for title, kinds in items):
                    raise AssertionError(f"liste inattendue : {items} pour {questions}")
                print(f"liste : {len(items)} questions, avec titre et types de champs")

                # Aperçu de la première question : provisoire, puis un tirage réel calculé par Python.
                page.click(".question-preview-button >> nth=0")
                page.wait_for_function(
                    "document.getElementById('preview-frame').srcdoc.includes('pw-question') && "
                    "!document.getElementById('preview-notice').textContent.startsWith('Aperçu provisoire') && "
                    "!document.getElementById('preview-notice').classList.contains('error')",
                    timeout=180_000)
                print("aperçu : tirage réel affiché")

                # « Afficher la solution », cochée par défaut : l’aperçu s’ouvre sur la solution ;
                # décochée, il montre la question vierge.
                preview = page.frame_locator("#preview-frame")
                preview.locator("#q1[data-state='solution']").wait_for(timeout=30_000)
                page.uncheck("#preview-solution")
                preview.locator("#q1[data-state='open']").wait_for(timeout=30_000)
                page.check("#preview-solution")
                preview.locator("#q1[data-state='solution']").wait_for(timeout=30_000)
                print("aperçu : « Afficher la solution » montre la solution, décochée la question vierge")

                # Compilation de cette question : un fichier HTML autonome est téléchargé.
                page.click(".question-selection >> nth=0")
                with page.expect_download(timeout=180_000) as waiting:
                    page.click("#compile-question")
                download = waiting.value
                message = page.text_content("#messages")
                if "téléchargée" not in message:
                    raise AssertionError(f"compilation en échec : {message}")
                if not download.suggested_filename.endswith(".html"):
                    raise AssertionError(f"fichier téléchargé inattendu : {download.suggested_filename}")
                html = open(download.path(), encoding="utf-8").read()
                if 'class="pw-question"' not in html or "data-draws" not in html:
                    raise AssertionError(f"{download.suggested_filename} ne contient pas de question compilée")
                print(f"compilation : {download.suggested_filename} téléchargé ({len(html) // 1024} Ko)")

                # « Tout sélectionner » n’agit que sur les questions visibles, puis devient « Tout désélectionner ».
                # Seule la première question est cochée (compilée ci-dessus) ; « matrice » en montre d’autres.
                checked = "[...document.querySelectorAll('.question-selection')].map(c => c.checked)"
                page.fill("#question-search", "matrice")
                visible = len(page.evaluate(checked))
                if not visible or any(page.evaluate(checked)):
                    raise AssertionError("La recherche « matrice » devait montrer des questions non cochés.")
                page.click("#select-visible")
                if not all(page.evaluate(checked)) or page.text_content("#select-visible") != "Tout désélectionner":
                    raise AssertionError("« Tout sélectionner » n’a pas coché les questions visibles.")
                page.fill("#question-search", "")
                if sum(page.evaluate(checked)) != visible + 1 or page.text_content("#select-visible") != "Tout sélectionner":
                    raise AssertionError(f"Les questions masquées ont changé d’état : {page.evaluate(checked)}")
                page.click("#select-visible")
                if not all(page.evaluate(checked)):
                    raise AssertionError("« Tout sélectionner » n’a pas coché toutes les questions.")
                page.click("#select-visible")
                if any(page.evaluate(checked)):
                    raise AssertionError("« Tout désélectionner » n’a pas décoché les questions.")
                print("tout sélectionner / désélectionner : questions visibles seulement")

                # Ordre (§ 11.9) : trois clics sur « ↓ » descendent trois fois la question choisie, sans
                # qu’un clic annule le précédent.
                page.click("#select-visible")
                page.select_option("#output-mode", "activity")
                order_script = "[...document.querySelectorAll('#activity-order-list .order-title')].map(b => b.textContent)"
                before = page.evaluate(order_script)
                page.click(".order-title >> nth=0")
                for _ in range(3):
                    page.click("#move-down")
                expected = before[1:4] + before[:1] + before[4:]
                chosen = page.evaluate("document.querySelector('#activity-order-list li.is-chosen .order-title').textContent")
                if page.evaluate(order_script) != expected or chosen != before[0]:
                    raise AssertionError(f"ordre après trois « ↓ » : {page.evaluate(order_script)}, attendu {expected}")
                page.select_option("#output-mode", "separate")
                page.click("#select-visible")
                print("ordre : trois « ↓ » descendent trois fois la question choisie")

                # Une question sans « question_check » : la compilation lit le module pywims et le script du
                # Worker pour ses tirages, mais le fichier n’en contient aucun (il ne charge pas Python).
                page.fill("#question-search", "Valeur approchée")
                page.click(".question-selection >> nth=0")
                with page.expect_download(timeout=180_000) as waiting:
                    page.click("#compile-question")
                without_python = open(waiting.value.path(), encoding="utf-8").read()
                if ('id="pywims-worker"></script>' not in without_python or
                        'id="pywims-module"></script>' not in without_python):
                    raise AssertionError("Une question sans « question_check » intègre le module ou le script du Worker.")
                print(f"question sans « question_check » : ni module ni Worker intégrés ({len(without_python) // 1024} Ko)")

                remembered_folder(page, {name: open(os.path.join(folder, name), encoding="utf-8").read()
                                        for name in ("Decim3.pwq", "pgcd.pwq")})
                # Erreurs JavaScript de la page principale seulement : la page sans mémoire a les siennes.
                without_remembered_folder(browser, url, folder)

            finally:
                browser.close()

        if errors:
            raise AssertionError(f"erreurs JavaScript : {errors}")
        print("aucune erreur JavaScript")
        return 0
    # Une vérification fausse, un délai dépassé ou un élément introuvable (page cassée) : échec lisible.
    except (AssertionError, PlaywrightError) as error:
        print(f"ÉCHEC : {error}")
        if errors:
            print(f"erreurs JavaScript : {errors}")
        return 1
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
