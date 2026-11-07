"""Valeur numérique : la solution est une fraction exacte, que la page compare sans arrondi
(SPECIFICATION.md, § 2.8) ; son texte affiché est écrit par la page, selon form et tolerance."""
import sys

from pywims import _float_text, _is_any


def value_solution(value):
    """Solution d’un champ input_value : {"value": "n/d", "exact": bool}, ou None pour une valeur libre.

    La valeur est une fraction exacte, que le navigateur compare sans erreur d’arrondi
    (SPECIFICATION.md, § 2.8). Un flottant est d’abord arrondi à 12 chiffres significatifs, comme
    la solution d’un champ texte : 0.1 + 0.2 vaut 3/10. Un irrationnel (sqrt(2), pi) est pris avec
    30 chiffres significatifs et marqué inexact : il exige une tolérance.
    """
    import decimal
    import fractions
    if _is_any(value):
        return None
    sympy = sys.modules.get("sympy")
    exact = True
    if isinstance(value, bool):
        raise TypeError("ce doit être un nombre, pas un booléen.")
    if isinstance(value, int):
        ratio = fractions.Fraction(value)
    elif isinstance(value, fractions.Fraction):
        ratio = value
    elif isinstance(value, decimal.Decimal):
        ratio = fractions.Fraction(value)
    elif isinstance(value, float) or (sympy is not None and isinstance(value, sympy.Float)):
        text = _float_text(value)
        try:
            ratio = fractions.Fraction(decimal.Decimal(text))
        except (decimal.InvalidOperation, ValueError, OverflowError):
            raise TypeError("{} n’est pas un nombre fini.".format(text)) from None
    elif sympy is not None and isinstance(value, sympy.Basic) and getattr(value, "is_number", False) and value.is_real:
        if value.is_rational:
            rational = sympy.Rational(value)
            ratio = fractions.Fraction(int(rational.p), int(rational.q))
        else:
            ratio = fractions.Fraction(decimal.Decimal(str(sympy.N(value, 30))))
            exact = False
    else:
        raise TypeError("ce doit être un nombre réel, et non {!r}.".format(value))
    return {"value": "{}/{}".format(ratio.numerator, ratio.denominator), "exact": exact}


def prepare(attributes):
    try:
        return {"solution": value_solution(attributes["solution"])}
    except TypeError as error:
        raise TypeError("la solution : {}".format(error)) from None
