"""Formule saisie avec MathLive : la solution s'affiche en LaTeX ; le contrôle de cohérence saisit sa
forme texte, celle que MathLive transmet à question_check (SPECIFICATION.md, § 2.3)."""
import sys

from pywims import _is_any
from pywims_widgets.lib.values import is_matrix, solution_text


def solution_latex(value):
    """Solution d’un champ MathLive, en LaTeX ; None pour une valeur libre."""
    if _is_any(value):
        return None
    sympy = sys.modules.get("sympy")
    if sympy is not None:
        return sympy.latex(value)
    return str(value)


def prepare(attributes):
    value = attributes["solution"]
    if is_matrix(value):
        raise TypeError("la solution doit être une valeur simple, pas une matrice.")
    return {"solution": solution_latex(value), "input": solution_text(value)}
