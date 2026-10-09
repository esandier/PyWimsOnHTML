# Capture d’une page, comme sur un ordinateur ou comme sur un téléphone, pour vérifier le rendu
# (SPECIFICATION.md, § 9). La page peut être une URL ou un fichier local (une feuille compilée).
# Prérequis : pip install playwright (voir navigateur.py).
# Usage : python capture.py URL_OU_FICHIER IMAGE.png [--phone] [--wait SECONDES] [--edge CHEMIN]
#   --phone : 375 px de large, écran tactile, densité 2 (la largeur de référence du projet).
#   --wait : délai après le chargement, pour MathJax et les animations (2 s par défaut).
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

# python -I n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from navigateur import page_address, launch_edge  # noqa: E402

PHONE = {"viewport": {"width": 375, "height": 812}, "device_scale_factor": 2,
             "is_mobile": True, "has_touch": True}
DESKTOP = {"viewport": {"width": 1280, "height": 900}}


def main():
    options = argparse.ArgumentParser(description="Capture d’une page sur ordinateur ou téléphone.")
    options.add_argument("page")
    options.add_argument("image")
    options.add_argument("--phone", action="store_true")
    options.add_argument("--wait", type=float, default=2)
    options.add_argument("--edge")
    arguments = options.parse_args()
    with sync_playwright() as playwright:
        browser = launch_edge(playwright, arguments.edge)
        try:
            page = browser.new_page(**(PHONE if arguments.phone else DESKTOP))
            # « load » et non « networkidle » : une page de questions charge Pyodide en arrière-plan,
            # parfois longtemps après l’affichage de l’énoncé.
            page.goto(page_address(arguments.page), wait_until="load", timeout=120_000)
            page.wait_for_timeout(arguments.wait * 1000)
            page.screenshot(path=arguments.image, full_page=True)
        finally:
            browser.close()
    print(f"capture : {arguments.image}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
