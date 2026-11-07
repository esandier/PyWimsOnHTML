"""Intervalle à la française (SPECIFICATION.md, § 2.10) : {{ interval(a, b, left_closed, right_closed) }}
dans un modèle, interval(a, b, …) dans « question_check » (from pywims import interval)."""
from pywims_widgets.lib.bounds import bound_tex


def render(left, right, left_closed=True, right_closed=True):
    r"""Intervalle en TeX : [a\,;\,b], ]a\,;\,b[ ; une borne infinie est toujours ouverte.

    \mathopen et \mathclose : un « ] » ouvrant est sinon lu comme fermant, et « ]-3 » s’écrit « ] − 3 ».
    """
    left_text, right_text = bound_tex(left), bound_tex(right)
    left_closed = left_closed and "infty" not in left_text
    right_closed = right_closed and "infty" not in right_text
    return (("[" if left_closed else r"\mathopen{]}") + r"{}\,;\,{}".format(left_text, right_text)
            + ("]" if right_closed else r"\mathclose{[}"))
