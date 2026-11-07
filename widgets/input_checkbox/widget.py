"""Choix multiple : choix donnés par une liste (choices=, solution=) ou écrits en bloc, [x] bon, [ ] mauvais
(SPECIFICATION.md, § 10.1). Le mélange, count et les rangs sont communs aux champs à choix."""
from pywims import _prepare_choices, _read_choice_block


def read_block(text, attributes):
    return _read_choice_block(text, attributes, multiple=True)


def prepare(attributes):
    return _prepare_choices(attributes, multiple=True, plain=False)
