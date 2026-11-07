"""Liste déroulante d'un texte à trous (SPECIFICATION.md, § 2.9), en texte simple : choix donnés par
une liste (choices=, solution=) ou écrits en bloc, [x] bon, [ ] mauvais (§ 10.1).
Le mélange, count et les rangs sont communs aux champs à choix."""
from pywims import _prepare_choices, _read_choice_block


def read_block(text, attributes):
    return _read_choice_block(text, attributes, multiple=False)


def prepare(attributes):
    return _prepare_choices(attributes, multiple=False, plain=True)
