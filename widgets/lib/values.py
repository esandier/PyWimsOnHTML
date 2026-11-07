"""Solutions des champs à saisir, écrites comme un élève les saisirait (SPECIFICATION.md, § 2.3)."""
# Bibliothèque Python des widgets, installée avec eux dans le paquet pywims_widgets (pywims_widgets.lib.values) ;
# un widget la déclare dans ses « libraries ».
import sys

from pywims import _float_text, _is_any


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


def solution_cells(value):
    """Solution d’une matrice : liste de lignes de textes, None pour une case libre."""
    sympy = sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            value = value.tolist()
    if not isinstance(value, (list, tuple)) or not all(isinstance(row, (list, tuple)) for row in value):
        raise TypeError("La solution d’une matrice doit être une Matrix ou une liste de lignes.")
    return [[solution_text(cell) for cell in row] for row in value]


def is_matrix(value):
    sympy = sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            return True
    return isinstance(value, (list, tuple))
