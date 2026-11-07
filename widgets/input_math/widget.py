"""Formule saisie avec MathLive : la solution s'affiche en LaTeX ; le contrôle de cohérence saisit sa
forme texte, celle que MathLive transmet à question_check (SPECIFICATION.md, § 2.3)."""
from pywims import _is_matrix, _solution_latex, _solution_text


def prepare(attributes):
    value = attributes["solution"]
    if _is_matrix(value):
        raise TypeError("la solution doit être une valeur simple, pas une matrice.")
    return {"solution": _solution_latex(value), "input": _solution_text(value)}
