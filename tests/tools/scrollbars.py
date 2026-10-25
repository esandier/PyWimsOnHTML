# Barres de défilement parasites : exporte, avec le code du moment, une activité de toutes les questions
# de la racine de questions/ (style habituel et style compact, charte UPEC et sa police), puis vérifie à
# plusieurs zooms et largeurs qu’aucune barre de défilement n’apparaît sans débordement réel, qu’un
# texte de choix n’est jamais débordant sans pouvoir défiler, et que la page ne défile pas en largeur.
#
# Pourquoi : des flèches de défilement apparaissaient sous les formules des choix, pour un dépassement
# d’une fraction de pixel ; trois correctifs locaux n’y ont pas suffi, et leurs vérifications ne
# voyaient pas les barres (Edge sans interface les masquait, voir edge.py). Les tirages changent à
# chaque chargement : chaque page est chargée plusieurs fois.
# Prérequis : Python avec playwright (voir edge.py) ; le compilateur calcule les tirages avec Pyodide.
# Usage : python tests/tools/scrollbars.py URL_DU_COMPILATEUR
import os
import shutil
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

# python -I n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edge import launch_edge, page_address  # noqa: E402

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOADS = 3
SCALES = (1, 1.25, 1.5)
WIDTHS = (1280, 375)
# Téléphones émulés (écran tactile, densité 2) : sans barre de défilement réservée, comme sur un vrai
# téléphone. En mode bureau, Edge en réserve une de 15 px et rogne ce qui la dépasse, ce qui cachait
# un champ de formule plus large que sa colonne à 320 px (octobre 2026).
PHONE_WIDTHS = (320, 375)
SCREENS = [(f"{width} px, {scale:g}", {"viewport": {"width": width, "height": 900}, "device_scale_factor": scale})
           for scale in SCALES for width in WIDTHS]
SCREENS += [(f"téléphone {width} px", {"viewport": {"width": width, "height": 900}, "device_scale_factor": 2,
                                        "is_mobile": True, "has_touch": True})
            for width in PHONE_WIDTHS]

# Une barre réelle se voit à l’écart entre la boîte (offset, bordures comprises) et la zone de
# contenu (client) ; elle n’est admise que pour un débordement de plus de 1 px dans son axe.
CHECK = """() => {
  const problems = [];
  const describe = element => (element.closest('.pw-question')?.id ?? '') + ' ' +
    element.className + ' « ' + element.textContent.trim().slice(0, 20) + ' »';
  for (const element of document.querySelectorAll('body *')) {
    const style = getComputedStyle(element);
    // Seul un élément qui défile peut avoir une barre ; un élément en ligne a une zone client nulle.
    if (![style.overflowX, style.overflowY].some(value => value === 'auto' || value === 'scroll')) continue;
    const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const horizontalBar = element.offsetHeight - borderY - element.clientHeight > 0.5;
    const verticalBar = element.offsetWidth - borderX - element.clientWidth > 0.5;
    if (horizontalBar && element.scrollWidth - element.clientWidth <= 1) {
      problems.push('barre horizontale sans débordement : ' + describe(element));
    }
    if (verticalBar && element.scrollHeight - element.clientHeight <= 1) {
      problems.push('barre verticale sans débordement : ' + describe(element));
    }
  }
  for (const text of document.querySelectorAll('.pw-choice-text:not(.is-wide)')) {
    if (text.scrollWidth > text.clientWidth + 1) {
      problems.push('choix débordant qui ne défile pas : ' + describe(text));
    }
    // La cause elle-même, sans dépendre des tirages : un choix qui peut défiler sans déborder
    // affichera une barre dès qu’un arrondi le fera dépasser d’une fraction de pixel.
    if (getComputedStyle(text).overflowX !== 'visible' || getComputedStyle(text).overflowY !== 'visible') {
      problems.push('choix qui peut défiler sans déborder : ' + describe(text));
    }
  }
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
    problems.push('la page défile en largeur');
  }
  return problems;
}"""


def export_activities(browser, url, folder, destination):
    """Exporte toutes les questions du dossier en une activité, style habituel puis compact."""
    page = browser.new_page(accept_downloads=True)
    page.goto(url)
    page.set_input_files("#question-folder", folder)
    page.wait_for_function("document.querySelectorAll('.question-selection').length > 0", timeout=60_000)
    for checkbox in page.query_selector_all(".question-selection"):
        checkbox.check()
    page.select_option("#output-mode", "activity")
    page.fill("#activity-title", "Barres de défilement")
    files = {}
    for style, compact in (("habituel", False), ("compact", True)):
        page.set_checked("#compact-style", compact)
        with page.expect_download(timeout=600_000) as waiting:
            page.click("#compile-question")
        files[style] = os.path.join(destination, f"{style}.html")
        waiting.value.save_as(files[style])
    page.close()
    return files


def main():
    url = sys.argv[1]
    folder = tempfile.mkdtemp(prefix="pywims-barres-")
    output = tempfile.mkdtemp(prefix="pywims-barres-export-")
    # Questions de la racine suivies par git, et la charte UPEC : sa police (Source Sans) est celle
    # avec laquelle les barres ont été constatées.
    tracked = subprocess.run(["git", "ls-files", "-z", "--", "questions/*.pwq"], cwd=PROJECT,
                             capture_output=True, check=True).stdout.decode("utf-8").split("\0")
    for path in tracked:
        if path.count("/") == 1:
            shutil.copy(os.path.join(PROJECT, path), folder)
    shutil.copy(os.path.join(PROJECT, "css", "brands", "upec.css"), os.path.join(folder, "brand.css"))
    problems = []
    try:
        with sync_playwright() as playwright:
            browser = launch_edge(playwright)
            files = export_activities(browser, url, folder, output)
            for style, file in files.items():
                for screen, options in SCREENS:
                    for _ in range(LOADS):
                        page = browser.new_page(**options)
                        page.goto(page_address(file), wait_until="load")
                        # Formules composées, puis colonnes des choix réglées (fitChoiceColumns).
                        page.wait_for_function("document.querySelectorAll('mjx-container').length > 0",
                                               timeout=60_000)
                        page.wait_for_timeout(1500)
                        for problem in page.evaluate(CHECK):
                            problems.append(f"{style}, {screen} : {problem}")
                        page.close()
                print(f"style {style} : {len(SCREENS) * LOADS} chargements vérifiés")
            browser.close()
    finally:
        shutil.rmtree(folder, ignore_errors=True)
        shutil.rmtree(output, ignore_errors=True)
    for problem in sorted(set(problems)):
        print(f"ÉCHEC : {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
