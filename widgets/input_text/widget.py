"""Champ texte : la solution est écrite comme un élève la saisirait (SPECIFICATION.md, § 2.3)."""
from pywims_widgets.lib.values import is_matrix, solution_text


def prepare(attributes):
    value = attributes["solution"]
    if is_matrix(value):
        raise TypeError("la solution doit être une valeur simple, pas une matrice.")
    return {"solution": solution_text(value)}
