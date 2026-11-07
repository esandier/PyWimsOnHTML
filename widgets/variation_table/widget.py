"""Tableau de variations (SPECIFICATION.md, § 2.10) : {{ variation_table(xs, values, up) }} dans un
modèle ; son style est dans widget.css, emporté une fois par page."""
from pywims_widgets.lib.bounds import bound_tex


def render(xs, values, up, signs=None, forbidden=(), function="f", variable="x"):
    r"""Tableau de variations (SPECIFICATION.md, § 2.10), rendu en HTML.

    xs : abscisses des bornes et des points remarquables ; values : valeur de la fonction en chacune
    (None : case vide, par exemple pas de limite aux bornes) ; up : sens de chaque intervalle, True pour
    croissant ; signs : signe de la dérivée sur chaque intervalle (« + » ou « - »), qui ajoute la ligne
    de f' avec 0 aux abscisses intérieures ; forbidden : abscisses où la fonction n’est pas définie
    (double barre). Une valeur est un nombre, ±∞ (float('inf') ou oo), ou un texte TeX tel quel.
    Valeurs alignées sur une ligne, et non placées en haut ou en bas selon le sens (choix de l’auteur,
    octobre 2026). Tableau HTML dont chaque case est une formule, plutôt qu’un array de TeX : MathJax
    en écartait les colonnes, et un tableau à quatre flèches défilait à 375 px.
    """
    xs, values, up = list(xs), list(values), list(up)
    if len(values) != len(xs) or len(up) != len(xs) - 1 or (signs is not None and len(signs) != len(up)):
        raise ValueError("il faut une valeur par abscisse, et un sens (et un signe) par "
                         "intervalle ({} abscisses, {} valeurs, {} sens).".format(len(xs), len(values), len(up)))
    barred = {bound_tex(value) for value in forbidden}
    bar = r"\|"

    def cell(text, line=False):
        formula = "${}$".format(text) if text else ""
        return '<td class="pw-tv-line">{}</td>'.format(formula) if line else "<td>{}</td>".format(formula)

    rows = [['<td class="pw-tv-head pw-tv-line">${}$</td>'.format(variable)]]
    if signs is not None:
        rows.append(['<td class="pw-tv-head pw-tv-line">${}\'({})$</td>'.format(function, variable)])
    rows.append(['<td class="pw-tv-head">${}({})$</td>'.format(function, variable)])
    for index, x in enumerate(xs):
        x_text = bound_tex(x)
        excluded = x_text in barred
        inner = 0 < index < len(xs) - 1
        rows[0].append(cell(x_text, True))
        if signs is not None:
            rows[1].append(cell(bar if excluded else "0" if inner else "", True))
        value = values[index]
        rows[-1].append(cell(bar if excluded else "" if value is None else bound_tex(value)))
        if index < len(up):
            rows[0].append(cell("", True))
            if signs is not None:
                rows[1].append(cell(signs[index], True))
            rows[-1].append(cell(r"\nearrow" if up[index] else r"\searrow"))
    body = "".join("<tr>{}</tr>".format("".join(row)) for row in rows)
    return '<div class="pw-tv-scroll"><table class="pw-tv">{}</table></div>'.format(body)
