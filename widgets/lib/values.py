"""Solutions des champs à saisir, écrites comme un élève les saisirait (SPECIFICATION.md, § 2.3)."""
# Bibliothèque Python des widgets, installée avec eux dans le paquet pywims_widgets (pywims_widgets.lib.values) ;
# un widget la déclare dans ses « libraries ».
import sys

from pywims import _float_text, _given_value, _is_any, tex


def solution_text(value):
    """Solution d’un champ texte, écrite comme un élève la saisirait ; None pour une valeur libre."""
    if _is_any(value):
        return None
    if isinstance(value, float):
        return _float_text(value)
    sympy = sys.modules.get("sympy")
    if sympy is not None and isinstance(value, sympy.Float):
        return _float_text(value)
    if sympy is not None and isinstance(value, sympy.Basic):
        return sympy.sstr(value).replace("**", "^")
    return str(value)


def solution_cells(value, allow_given=False):
    """Solution d’une matrice : liste de lignes de textes, None pour une case libre ; une case donnée
    (given(v), si allow_given) est {"given": texte saisi, "tex": formule affichée}."""
    sympy = sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            value = value.tolist()
    if not isinstance(value, (list, tuple)) or not all(isinstance(row, (list, tuple)) for row in value):
        raise TypeError("La solution d’une matrice doit être une Matrix ou une liste de lignes.")
    return [[solution_cell(cell, allow_given) for cell in row] for row in value]


def solution_cell(value, allow_given):
    given = _given_value(value)
    if given is None:
        return solution_text(value)
    if not allow_given:
        raise TypeError("une case donnée (given) n’existe que dans une matrice de taille fixe (input_matrix).")
    if _is_any(given):
        raise TypeError("une case donnée a une valeur : given(ANY) ne veut rien dire.")
    # Le texte est ce que « question_check » reçoit, comme une saisie ; la formule, ce que voit l’élève.
    return {"given": solution_text(given), "tex": tex(given)}


def is_matrix(value):
    sympy = sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            return True
    return isinstance(value, (list, tuple))
