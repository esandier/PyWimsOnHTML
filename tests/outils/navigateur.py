# Lancement d’Edge par Playwright, commun aux outils de test (pilote_edge.py, essai_compilateur.py,
# capture.py).
# Prérequis : pip install playwright. Playwright pilote l’Edge installé (channel « msedge ») : aucun
# autre navigateur à télécharger. Il démarre avec un profil neuf et sans extension, ce qui compte :
# une extension de filtrage du profil habituel bloquait les paquets Pyodide.
# Solution écartée : piloter Edge par son protocole de débogage, à la main (websocket) ; il fallait
# réécrire l’attente, le sélecteur de dossier, les téléchargements, et Edge sans interface refusait
# une fenêtre de moins d’environ 500 px, ce qui empêchait de vérifier le rendu sur téléphone.
import os
import pathlib


def lancer_edge(playwright, chemin=None):
    """Edge sans interface ; chemin : exécutable d’Edge, si Playwright ne le trouve pas seul."""
    options = {"executable_path": chemin} if chemin else {"channel": "msedge"}
    return playwright.chromium.launch(headless=True, **options)


def adresse(cible):
    """URL d’une page : une adresse telle quelle, ou un fichier local (ouvert en file://)."""
    if os.path.exists(cible):
        return pathlib.Path(cible).resolve().as_uri()
    return cible
