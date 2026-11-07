"""Champs à choix (SPECIFICATION.md, § 10) : choix donnés par une liste ou écrits en bloc, [x] bon,
[ ] mauvais ; count, rangs remis à « question_check », mélange et colonnes."""
# Bibliothèque Python des widgets input_radio, input_checkbox et input_select (pywims_widgets.lib.choices).
import re

from pywims import _choice_text
from pywims_widgets.lib.values import solution_text


def choice_texts(value, plain=False):
    """Textes des choix d’un champ à choix : un texte reste tel quel, un objet SymPy devient une formule.

    plain : choix d’une liste déroulante (input_select, SPECIFICATION.md, § 2.9), qui n’affiche ni
    HTML ni formule : un objet SymPy s’y écrit comme dans un champ texte, et une formule TeX est
    refusée, au lieu de s’afficher en code brut.
    """
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)) or len(value) < 2:
        raise TypeError("ce doit être une liste d’au moins deux choix.")
    if not plain:
        return [_choice_text(choice) for choice in value]
    texts = [solution_text(choice) for choice in value]
    for text in texts:
        if "$" in text or "\\(" in text or "\\[" in text:
            raise TypeError("une liste déroulante n’affiche pas de formule : « {} » doit être du texte simple.".format(text))
    return texts


def choice_index(value, count):
    """Indice d’un choix, entre 0 et count - 1 ; un entier SymPy est admis, un booléen non.

    En Python, True vaut 1 : sans ce refus, « solution = [x > 0] » passerait pour l’indice 1 (ou 0
    pour False) et désignerait silencieusement un choix, au lieu de signaler l’erreur de l’auteur.
    """
    try:
        if isinstance(value, bool):
            raise TypeError
        index = int(value)
    except (TypeError, ValueError):
        raise TypeError("{!r} n’est pas un indice de choix.".format(value)) from None
    if index != value or not 0 <= index < count:
        raise TypeError("{!r} n’est pas un indice de choix (de 0 à {}).".format(value, count - 1))
    return index


def choice_solution(value, multiple, count):
    """Solution d’un champ à choix : un indice (choix unique), ou la liste croissante des indices
    des bons choix (choix multiple), vide si aucun choix n’est bon."""
    if not multiple:
        if isinstance(value, (list, tuple, set)):
            raise TypeError("ce doit être l’indice du bon choix, pas une liste.")
        return choice_index(value, count)
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple, set)):
        raise TypeError("ce doit être la liste des indices des bons choix.")
    indices = [choice_index(item, count) for item in value]
    if len(set(indices)) != len(indices):
        raise TypeError("un indice de choix est répété.")
    return sorted(indices)


# Marque d’un choix dans un bloc des choix (§ 10.1) : [x] bon, [ ] mauvais, en début de ligne.
CHOICE_MARK = re.compile(r"^[ \t]*\[([ xX])\][ \t]?", re.M)


def block_choices(text):
    """Choix d’un bloc rendu : (textes, rangs des bons choix), ou TypeError."""
    marks = list(CHOICE_MARK.finditer(text))
    if not marks:
        raise TypeError("aucun choix : chaque choix commence, en début de ligne, par [x] (bon) ou [ ] (mauvais).")
    if text[:marks[0].start()].strip():
        raise TypeError("du texte précède le premier choix : « {} ».".format(text[:marks[0].start()].strip()[:60]))
    texts, good = [], []
    for rank, mark in enumerate(marks):
        end = marks[rank + 1].start() if rank + 1 < len(marks) else len(text)
        body = text[mark.end():end].strip()
        if not body:
            raise TypeError("le choix {} est vide.".format(rank))
        texts.append(body)
        if mark.group(1) in "xX":
            good.append(rank)
    return texts, good


def block_ranks(texts, good, count):
    """Rangs des choix affichés avec count (§ 10.1) : les bons, et des mauvais tirés parmi ceux dont le
    texte n’est pas déjà gardé, comme mcq. Le tirage dépend des textes rendus, et non du random de
    l’auteur : le navigateur rejoue « question_setup » sans rendre les modèles."""
    import random
    import zlib
    if count is None:
        return list(range(len(texts)))
    normalized = lambda text: " ".join(text.split())
    seen = {normalized(texts[rank]) for rank in good}
    wrong = []
    for rank, text in enumerate(texts):
        if rank not in good and normalized(text) not in seen:
            seen.add(normalized(text))
            wrong.append(rank)
    needed = count - len(good)
    if needed < 1 or needed > len(wrong):
        raise TypeError("count={} demande {} mauvais choix, et le bloc en a {} de textes différents.".format(
            count, needed, len(wrong)))
    picker = random.Random(zlib.crc32("\u0002".join(texts).encode("utf-8")))
    return sorted(good + picker.sample(wrong, needed))


def read_choice_block(text, attributes, multiple):
    """Choix d’un bloc rendu (§ 10.1) : textes affichés, solution et, avec count, rang de chaque choix
    affiché dans le bloc, remis à « question_check » (§ 10.3)."""
    texts, good = block_choices(text)
    if not multiple and len(good) != 1:
        raise TypeError("il faut exactement un bon choix [x], et il y en a {}.".format(len(good)))
    count = attributes.get("count")
    if count is not None and count < 2:
        raise TypeError("count doit être au moins 2.")
    shown = block_ranks(texts, good, count)
    if len(shown) < 2:
        raise TypeError("il faut au moins deux choix.")
    positions = [shown.index(rank) for rank in good]
    result = {"choices": [texts[rank] for rank in shown], "solution": positions if multiple else positions[0]}
    if count is not None:
        result["ranks"] = shown
    return result


def prepare_choices(attributes, multiple, plain):
    """Choix et solution d’un champ à choix ; plain : liste déroulante, en texte simple (§ 2.9)."""
    try:
        texts = choice_texts(attributes["choices"], plain=plain)
    except TypeError as error:
        raise TypeError("les choix : {}".format(error)) from None
    try:
        solution = choice_solution(attributes["solution"], multiple, len(texts))
    except TypeError as error:
        raise TypeError("la solution : {}".format(error)) from None
    if not 1 <= attributes.get("columns", 1) <= 6:
        raise TypeError("columns doit être compris entre 1 et 6.")
    # Sans mélange, tous les choix restent à leur place : fixed_last ne dirait rien, et sa présence
    # trahit presque toujours une confusion de l’auteur.
    if attributes.get("shuffle") is False and "fixed_last" in attributes:
        raise TypeError("fixed_last est sans effet avec shuffle=false, qui garde déjà tous les choix à leur place.")
    if attributes.get("fixed_last", 0) >= len(texts):
        raise TypeError("fixed_last={} doit être inférieur au nombre de choix ({}).".format(
            attributes["fixed_last"], len(texts)))
    return {"solution": solution, "choices": texts, "ranks": attributes.get("ranks")}
