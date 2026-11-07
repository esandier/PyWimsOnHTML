"""Écriture d’une borne ou d’une valeur de tableau, commune aux éléments interval et variation_table."""
# Bibliothèque Python des widgets (pywims_widgets.lib.bounds).
import sys

from pywims import tex


def bound_tex(value):
    """Valeur d’un tableau ou d’une borne : ±∞ (float ou oo de SymPy), un texte TeX tel quel, sinon tex."""
    if isinstance(value, str):
        return value
    sympy = sys.modules.get("sympy")
    if value == float("inf") or (sympy is not None and value == sympy.oo):
        return r"+\infty"
    if value == float("-inf") or (sympy is not None and value == -sympy.oo):
        return r"-\infty"
    return tex(value, frac=True)
