"""Valeur numérique : la solution est une fraction exacte, que la page compare sans arrondi
(SPECIFICATION.md, § 2.8) ; son texte affiché est écrit par la page, selon form et tolerance."""
from pywims import _value_solution


def prepare(attributes):
    try:
        return {"solution": _value_solution(attributes["solution"])}
    except TypeError as error:
        raise TypeError("la solution : {}".format(error)) from None
