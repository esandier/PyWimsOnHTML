# Ouvre une page de tests dans Edge sans interface (profil vierge, sans extension), attend
# l’attribut data-done de <body>, puis affiche le nombre de résultats et les échecs.
# Prérequis : pip install playwright (voir navigateur.py).
# Usage : python pilote_edge.py URL [CHEMIN_EDGE]
import os
import sys

from playwright.sync_api import TimeoutError as DelaiDepasse
from playwright.sync_api import sync_playwright

# python -I (lancer-tests.ps1) n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from navigateur import lancer_edge  # noqa: E402

TIMEOUT_SECONDS = 600


def main():
    url = sys.argv[1]
    with sync_playwright() as playwright:
        browser = lancer_edge(playwright, sys.argv[2] if len(sys.argv) > 2 else None)
        try:
            page = browser.new_page()
            page.goto(url)
            try:
                page.wait_for_function("document.body && document.body.dataset.done === 'true'",
                                       timeout=TIMEOUT_SECONDS * 1000, polling=1000)
            except DelaiDepasse:
                print("Délai dépassé : les tests ne se sont pas terminés.")
                return 1
            results = page.eval_on_selector_all("#results li", "items => items.map(li => li.textContent)")
        finally:
            browser.close()
    failed = [line for line in results if line.startswith("ÉCHEC")]
    print(f"{len(results)} résultats, {len(failed)} échec(s)")
    for line in failed:
        print(line)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
