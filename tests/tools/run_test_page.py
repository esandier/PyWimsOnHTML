# Ouvre une page de tests dans Edge sans interface (profil vierge, sans extension), attend
# l’attribut data-done de <body>, puis affiche le nombre de résultats et les échecs.
# Prérequis : pip install playwright (voir edge.py).
# Usage : python run_test_page.py URL [CHEMIN_EDGE]
import os
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

# python -I (run-tests.ps1) n’ajoute pas le dossier du script au chemin d’import.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edge import launch_edge  # noqa: E402

TIMEOUT_SECONDS = 600


def main():
    url = sys.argv[1]
    with sync_playwright() as playwright:
        browser = launch_edge(playwright, sys.argv[2] if len(sys.argv) > 2 else None)
        try:
            page = browser.new_page()
            page.goto(url)
            finished = True
            try:
                page.wait_for_function("document.body && document.body.dataset.done === 'true'",
                                       timeout=TIMEOUT_SECONDS * 1000, polling=1000)
            except PlaywrightTimeout:
                finished = False
            # Les résultats déjà obtenus sont lus même après un délai dépassé : ils disent où les tests
            # se sont arrêtés. data-seconds : durée du test, si la page la mesure.
            results = page.eval_on_selector_all(
                "#results li", "items => items.map(li => [li.textContent, Number(li.dataset.seconds ?? NaN)])")
        finally:
            browser.close()
    failed = [line for line, _ in results if line.startswith("ÉCHEC")]
    print(f"{len(results)} résultats, {len(failed)} échec(s)")
    for line in failed:
        print(line)
    timed = sorted((item for item in results if item[1] == item[1]), key=lambda item: -item[1])
    if timed:
        total = sum(seconds for _, seconds in timed)
        print(f"Durée des tests : {total:.0f} s ; les plus lents :")
        for line, seconds in timed[:8]:
            print(f"  {seconds:6.1f} s  {line.split(' — ')[0][:110]}")
    if not finished:
        print(f"Délai dépassé ({TIMEOUT_SECONDS} s) : les tests ne se sont pas terminés.")
        return 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
