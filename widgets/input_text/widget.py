"""Champ texte : la solution est écrite comme un élève la saisirait (SPECIFICATION.md, § 2.3)."""
from pywims import _is_matrix, _solution_text


def prepare(attributes):
    value = attributes["solution"]
    if _is_matrix(value):
        raise TypeError("la solution doit être une valeur simple, pas une matrice.")
    return {"solution": _solution_text(value)}
