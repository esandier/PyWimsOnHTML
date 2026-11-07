"""Outils PyWims : from pywims import math_expression, mcq, tex, ANY"""
# Module installé dans Pyodide par runtime/python.js, à la compilation comme dans le fichier généré,
# qui l’intègre tel quel : les tirages calculés et rejoués utilisent ainsi le même code
# (SPECIFICATION.md, § 3). Les fonctions dont le nom commence par « _ » servent au compilateur et à
# la page ; les outils de l’auteur sont listés dans __all__, et chacun de leurs noms doit aussi être
# réservé dans runtime/template.js (un test le vérifie).
import re as _re
import sys as _sys

__all__ = ["math_expression", "mcq", "tex", "ANY"]

_any_value = None


def __getattr__(name):
    """Crée ANY à la demande : SymPy n’est importé que par les questions qui l’utilisent."""
    global _any_value
    if name == "ANY":
        if _any_value is None:
            import sympy
            # Symbole unique, utilisable dans une Matrix, qui marque une valeur de solution libre.
            _any_value = sympy.Dummy("ANY")
        return _any_value
    raise AttributeError(f"module 'pywims' has no attribute {name!r}")


def _is_any(value):
    return _any_value is not None and value is _any_value


def _plain_decimal(value):
    """Écriture décimale d’un Decimal, sans exposant ni zéros finaux : 1E+3 → 1000, 2.50 → 2.5."""
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    # -0 s’écrirait « -0 » : un élève n’écrit jamais le signe d’un zéro.
    return "0" if text in ("-0", "") else text


def _float_text(value):
    """Flottant arrondi à 12 chiffres significatifs, en écriture décimale avec un point.

    L’arrondi efface les artefacts du calcul binaire (0.1 + 0.2 vaut 0.30000000000000004) : sans
    lui, le bouton « Correction » afficherait ces chiffres et la correction par défaut les exigerait
    (SPECIFICATION.md, § 2.6). Douze chiffres gardent toute valeur qu’une question demande.
    """
    import decimal
    import math
    number = float(value)
    if not math.isfinite(number):
        return str(number)
    return _plain_decimal(decimal.Decimal(format(number, ".12g")))


def _solution_text(value):
    """Solution d’un champ texte, écrite comme un élève la saisirait ; None pour une valeur libre."""
    if _is_any(value):
        return None
    if isinstance(value, float):
        return _float_text(value)
    sympy = _sys.modules.get("sympy")
    if sympy is not None and isinstance(value, sympy.Float):
        return _float_text(value)
    if sympy is not None and isinstance(value, sympy.Basic):
        return sympy.sstr(value).replace("**", "^")
    return str(value)


def _solution_latex(value):
    """Solution d’un champ MathLive, en LaTeX ; None pour une valeur libre."""
    if _is_any(value):
        return None
    sympy = _sys.modules.get("sympy")
    if sympy is not None:
        return sympy.latex(value)
    return str(value)


def _solution_cells(value):
    """Solution d’une matrice : liste de lignes de textes, None pour une case libre."""
    sympy = _sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            value = value.tolist()
    if not isinstance(value, (list, tuple)) or not all(isinstance(row, (list, tuple)) for row in value):
        raise TypeError("La solution d’une matrice doit être une Matrix ou une liste de lignes.")
    return [[_solution_text(cell) for cell in row] for row in value]


def _value_solution(value):
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
    sympy = _sys.modules.get("sympy")
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


def _choice_texts(value, plain=False):
    """Textes des choix d’un champ à choix : un texte reste tel quel, un objet SymPy devient une formule.

    plain : choix d’une liste déroulante (input_select, SPECIFICATION.md, § 2.9), qui n’affiche ni
    HTML ni formule : un objet SymPy s’y écrit comme dans un champ texte, et une formule TeX est
    refusée, au lieu de s’afficher en code brut.
    """
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)) or len(value) < 2:
        raise TypeError("ce doit être une liste d’au moins deux choix.")
    if not plain:
        return [_choice_text(choice) for choice in value]
    texts = [_solution_text(choice) for choice in value]
    for text in texts:
        if "$" in text or "\\(" in text or "\\[" in text:
            raise TypeError("une liste déroulante n’affiche pas de formule : « {} » doit être du texte simple.".format(text))
    return texts


def _choice_text(choice):
    """Texte d’un choix : un texte reste tel quel, un objet SymPy devient une formule en ligne, pour
    que les choix restent compacts, côte à côte sur téléphone."""
    sympy = _sys.modules.get("sympy")
    if sympy is not None and isinstance(choice, sympy.Basic):
        return r"\(" + sympy.latex(choice) + r"\)"
    return str(choice)


def _choice_index(value, count):
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


def _choice_solution(value, multiple, count):
    """Solution d’un champ à choix : un indice (choix unique), ou la liste croissante des indices
    des bons choix (choix multiple), vide si aucun choix n’est bon."""
    if not multiple:
        if isinstance(value, (list, tuple, set)):
            raise TypeError("ce doit être l’indice du bon choix, pas une liste.")
        return _choice_index(value, count)
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple, set)):
        raise TypeError("ce doit être la liste des indices des bons choix.")
    indices = [_choice_index(item, count) for item in value]
    if len(set(indices)) != len(indices):
        raise TypeError("un indice de choix est répété.")
    return sorted(indices)


def _is_matrix(value):
    sympy = _sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, MatrixBase):
            return True
    return isinstance(value, (list, tuple))


_jinja_environment = None


def _jinja():
    """Environnement Jinja des modèles (SPECIFICATION.md, § 2.10), créé une fois.

    StrictUndefined : une variable absente est une erreur, au lieu d’un texte vide qu’on ne voit qu’en
    relisant l’énoncé. Pas d’échappement : l’énoncé est le HTML de l’auteur, et une macro peut produire
    du HTML ; le texte de l’élève n’entre jamais dans un modèle. finalize écrit chaque {{ valeur }}
    par tex, et les filtres frac et dec en sont les options.
    """
    global _jinja_environment
    if _jinja_environment is None:
        import jinja2
        environment = jinja2.Environment(undefined=jinja2.StrictUndefined, autoescape=False,
                                         keep_trailing_newline=True, finalize=tex)
        environment.filters["frac"] = lambda value: tex(value, frac=True)
        environment.filters["dec"] = lambda value, digits=None: tex(value, dec=True, digits=digits)
        environment.filters["coef"] = _coef
        environment.filters["term"] = _term
        environment.filters["signed"] = _signed
        environment.filters["paren"] = _paren
        environment.globals["variation_table"] = variation_table
        environment.globals["interval"] = interval
        _jinja_environment = environment
    return _jinja_environment


# Éléments d’écriture (SPECIFICATION.md, § 2.10) : ce que plusieurs questions recopiaient, rendu par
# l’énoncé à partir des données de « question_setup ». Un élément ne crée jamais de champ de réponse :
# le compilateur repère les champs en lisant l’énoncé.
def _bound_tex(value):
    """Valeur d’un tableau ou d’une borne : ±∞ (float ou oo de SymPy), un texte TeX tel quel, sinon tex."""
    if isinstance(value, str):
        return value
    sympy = _sys.modules.get("sympy")
    if value == float("inf") or (sympy is not None and value == sympy.oo):
        return r"+\infty"
    if value == float("-inf") or (sympy is not None and value == -sympy.oo):
        return r"-\infty"
    return tex(value, frac=True)


# Styles du tableau de variations. Sur un écran étroit, texte et marges réduits : un tableau à quatre
# flèches tient dans un téléphone de 375 px ; sinon, seul le tableau défile, jamais la page.
_VARIATION_STYLE = """<style>
  .pw-tv-scroll { max-width: 100%; overflow-x: auto; }
  .pw-tv { border-collapse: collapse; margin: 0.6em auto; text-align: center; }
  .pw-tv td { padding: 0.3em 0.4em; }
  .pw-tv .pw-tv-head { border-right: 1px solid; padding: 0.3em 0.5em; }
  .pw-tv .pw-tv-line { border-bottom: 1px solid; }
  @media (max-width: 480px) {
    .pw-tv { font-size: 0.9em; }
    .pw-tv td { padding: 0.3em 0.2em; }
  }
</style>"""


def variation_table(xs, values, up, signs=None, forbidden=(), function="f", variable="x"):
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
        raise ValueError("variation_table : il faut une valeur par abscisse, et un sens (et un signe) par "
                         "intervalle ({} abscisses, {} valeurs, {} sens).".format(len(xs), len(values), len(up)))
    barred = {_bound_tex(value) for value in forbidden}
    bar = r"\|"

    def cell(text, line=False):
        formula = "${}$".format(text) if text else ""
        return '<td class="pw-tv-line">{}</td>'.format(formula) if line else "<td>{}</td>".format(formula)

    rows = [['<td class="pw-tv-head pw-tv-line">${}$</td>'.format(variable)]]
    if signs is not None:
        rows.append(['<td class="pw-tv-head pw-tv-line">${}\'({})$</td>'.format(function, variable)])
    rows.append(['<td class="pw-tv-head">${}({})$</td>'.format(function, variable)])
    for index, x in enumerate(xs):
        x_text = _bound_tex(x)
        excluded = x_text in barred
        inner = 0 < index < len(xs) - 1
        rows[0].append(cell(x_text, True))
        if signs is not None:
            rows[1].append(cell(bar if excluded else "0" if inner else "", True))
        value = values[index]
        rows[-1].append(cell(bar if excluded else "" if value is None else _bound_tex(value)))
        if index < len(up):
            rows[0].append(cell("", True))
            if signs is not None:
                rows[1].append(cell(signs[index], True))
            rows[-1].append(cell(r"\nearrow" if up[index] else r"\searrow"))
    body = "".join("<tr>{}</tr>".format("".join(row)) for row in rows)
    return '{}<div class="pw-tv-scroll"><table class="pw-tv">{}</table></div>'.format(_VARIATION_STYLE, body)


def interval(left, right, left_closed=True, right_closed=True):
    r"""Intervalle en TeX, à la française : [a\,;\,b], ]a\,;\,b[ ; une borne infinie est toujours ouverte.

    \mathopen et \mathclose : un « ] » ouvrant est sinon lu comme fermant, et « ]-3 » s’écrit « ] − 3 ».
    """
    left_text, right_text = _bound_tex(left), _bound_tex(right)
    left_closed = left_closed and "infty" not in left_text
    right_closed = right_closed and "infty" not in right_text
    return (("[" if left_closed else r"\mathopen{]}") + r"{}\,;\,{}".format(left_text, right_text)
            + ("]" if right_closed else r"\mathclose{[}"))


# Filtres d’écriture (SPECIFICATION.md, § 2.10) : ils écrivent un nombre déjà calculé, avec son
# signe ou sans coefficient 1, là où chaque question réécrivait sa fonction (signed, linear,
# written…). Fractions en \frac : ces nombres sont des coefficients, dans une formule.
def _real(value, name):
    """Nombre réel écrit par un filtre, ou TypeError : un filtre ne calcule rien."""
    if isinstance(value, bool) or isinstance(value, str):
        raise TypeError("le filtre {} écrit un nombre, et non {!r}.".format(name, value))
    try:
        return value < 0, value == 0
    except TypeError:
        raise TypeError("le filtre {} écrit un nombre réel, et non {!r}.".format(name, value)) from None


def _signed(value):
    """+3, -3 : un nombre précédé de son signe."""
    negative, _ = _real(value, "signed")
    return tex(value, frac=True) if negative else "+" + tex(value, frac=True)


def _paren(value):
    """(-3) pour un négatif, dans un produit ou une puissance ; 3 sinon."""
    negative, _ = _real(value, "paren")
    return "(" + tex(value, frac=True) + ")" if negative else tex(value, frac=True)


def _coef(value):
    """Coefficient en tête d’un terme : 1 ne s’écrit pas, -1 s’écrit « - »."""
    _real(value, "coef")
    if value == 1:
        return ""
    if value == -1:
        return "-"
    return tex(value, frac=True)


def _term(value, variable=""):
    """Terme suivant d’une somme, avec son signe : +3x, -x ; rien pour un coefficient nul."""
    negative, zero = _real(value, "term")
    if zero:
        return ""
    sign = "-" if negative else "+"
    size = -value if negative else value
    if variable and size == 1:
        return sign + variable
    return sign + tex(size, frac=True) + variable


def _template_line(error):
    """Ligne du modèle où une erreur de rendu s’est produite, ou None (pile d’appels réécrite par Jinja)."""
    line = getattr(error, "lineno", None)
    traceback = error.__traceback__
    while traceback is not None:
        if traceback.tb_frame.f_code.co_filename == "<template>":
            line = traceback.tb_lineno
        traceback = traceback.tb_next
    return line


# Code de Jinja ({{ … }}, {% … %}) d’un modèle : ramené à la forme NFKC, comme Python le fait pour ses noms.
# Sans cela, un « é » tapé en deux caractères (e + accent) ne désignerait pas la variable « é » de
# « question_setup » (Jinja ne normalise pas). Le texte hors des délimiteurs reste tel quel.
_JINJA_CODE = _re.compile(r"\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}")


def _render(namespace, source, field, functions=None, shared=None):
    """Rend un modèle avec l’espace de noms du tirage ; renvoie (texte, noms lus, définitions), ou lève
    ValueError.

    Les noms lus sont les variables que le modèle ne définit pas lui-même (meta de Jinja) : ce sont
    celles de « question_setup » que la page contrôle quand elle rejoue le tirage (§ 5.1).
    functions : les widgets, que le modèle appelle (§ 2.11) ; ils ne comptent pas parmi les noms lus.
    shared : définitions {% set %} de l’énoncé, visibles dans l’explication (§ 2.10) ; les définitions
    renvoyées sont celles de premier niveau de ce modèle.
    """
    import jinja2
    import jinja2.meta
    import unicodedata
    # Trois accolades de suite : Jinja y lit « {{ » suivi de « {n} », et son message est incompréhensible
    # (SPECIFICATION.md, § 2.4).
    if "{{{" in source:
        raise ValueError(r"« " + field + r" » : trois accolades de suite (par exemple \frac{{{n}}}{2}) : Jinja y lit "
                         r"« {{ » suivi de « {n} » ; écrivez \frac{ {{n}} }{2}, avec des espaces.")
    source = _JINJA_CODE.sub(lambda code: unicodedata.normalize("NFKC", code.group()), source)
    environment = _jinja()
    try:
        names = jinja2.meta.find_undeclared_variables(environment.parse(source))
        template = environment.from_string(source)
    except jinja2.TemplateSyntaxError as error:
        raise ValueError("« {} », ligne {} : {}.".format(field, error.lineno, error.message)) from None
    values = dict(namespace)
    values.update(shared or {})
    values.update(functions or {})
    names = names - set(functions or {})
    try:
        # make_module rend le modèle et garde ses définitions de premier niveau ({% set %}). Contrairement
        # à render, il ne ramène pas la pile d’appels aux lignes du modèle : handle_exception le fait,
        # sans quoi une erreur citerait une ligne du code Python que Jinja engendre.
        try:
            module = template.make_module(values)
        except Exception:
            environment.handle_exception()
        text = str(module)
        definitions = {key: value for key, value in vars(module).items() if not key.startswith("_")}
    except Exception as error:
        line = _template_line(error)
        where = "« {} »{}".format(field, ", ligne {}".format(line) if line else "")
        if isinstance(error, _FieldError):
            raise ValueError("{} : {}".format(where, error)) from None
        undefined = _re.fullmatch(r"'([^']+)' is undefined", str(error))
        if undefined:
            raise ValueError("{} : la variable « {} » n’est pas définie par « question_setup ».".format(
                where, undefined.group(1))) from None
        raise ValueError("{} : {}: {}".format(where, type(error).__name__, error)) from None
    return text, names - set(shared or {}), definitions


# Marque d’un choix dans un bloc des choix (§ 10.1) : [x] bon, [ ] mauvais, en début de ligne.
_CHOICE_MARK = _re.compile(r"^[ \t]*\[([ xX])\][ \t]?", _re.M)


def _block_choices(text):
    """Choix d’un bloc rendu : (textes, rangs des bons choix), ou TypeError."""
    marks = list(_CHOICE_MARK.finditer(text))
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


def _block_ranks(texts, good, count):
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


def _is_plain_value(value):
    """Valeur dont le texte est reproductible : ni fonction, ni module, ni classe (leur texte
    contient une adresse, qui change d’une exécution à l’autre)."""
    import types
    return not (callable(value) or isinstance(value, types.ModuleType))


def _collect_draw(namespace, spec):
    """Données d’un tirage pour le compilateur, avec la liste des erreurs de l’auteur.

    spec (JSON) : {"statement": modèle, "explanation": modèle ou null, "has_check": booléen,
                   "widgets": {nom: {"declaration": widget.json lu, "python": texte de widget.py ou null}}}
    Les champs sont notés par les widgets que Jinja appelle en rendant l’énoncé (§ 2.11).
    """
    import json
    spec = json.loads(spec)
    errors = []
    # Pour Jinja, none, true et false sont des littéraux : {{ none }} affiche « None » sans lire la
    # variable. Une erreur plutôt qu’un avertissement : l’énoncé serait faux à chaque tirage.
    # « from sympy import * » apporte true et false, les booléens de SymPy : ce ne sont pas des
    # variables de l’auteur, et le modèle ne les lisait pas.
    sympy = _sys.modules.get("sympy")
    for name in ("none", "true", "false"):
        if name in namespace and not (sympy and namespace[name] is getattr(sympy, name, None)):
            errors.append("La variable « {} » de « question_setup » est un mot réservé de Jinja "
                          "(la valeur {}) : renommez-la.".format(name, name.capitalize()))
    # Une variable qui porte le nom d’une fonction de Jinja (range, dict…) la masque dans les modèles :
    # sans effet si le modèle ne s’en sert pas, d’où un avertissement seulement.
    warnings = ["La variable « {} » de « question_setup » masque la fonction « {} » de Jinja dans "
                "l’énoncé : renommez-la.".format(name, name)
                for name in sorted(_jinja().globals) if name in namespace]
    widgets = {name: (widget["declaration"], _widget_module(name, widget.get("python")))
               for name, widget in spec["widgets"].items()}
    draw = {"fields": [], "solutions": {}, "choices": {}, "ranks": {}, "inputs": {}}
    rendered = {}
    read = set()
    # Définitions {% set %} de l’énoncé, visibles dans l’explication (§ 2.10).
    shared = {}
    for key, field in (("statement", "question_statement"), ("explanation", "question_solution_explanation")):
        if spec.get(key) is None:
            continue
        functions = {name: _field_function(name, declaration, module, draw, namespace, spec["has_check"],
                                           in_statement=key == "statement")
                     for name, (declaration, module) in widgets.items()}
        try:
            rendered[key], names, definitions = _render(
                namespace, spec[key], field, functions=functions, shared=shared if key == "explanation" else None)
            read |= names
            if key == "statement":
                shared = definitions
        except ValueError as error:
            errors.append(str(error))
    context = {name: _template_value(namespace[name]) for name in sorted(read)
               if name in namespace and _is_plain_value(namespace[name])}
    return json.dumps({
        "statement": rendered.get("statement"), "explanation": rendered.get("explanation"),
        "context": context, **draw, "errors": errors, "warnings": warnings,
    }, ensure_ascii=False)


# Widgets (SPECIFICATION.md, § 2.11). Chaque dossier de widgets/ déclare ses attributs (widget.json) et
# prépare sa solution (widget.py) ; le compilateur donne les deux à chaque tirage. Jinja appelle le widget
# comme une fonction, écrit {{ input_value('n', solution=s) }} ou en bloc, {% call input_radio('n') %} … ;
# le moteur vérifie les attributs d’après la déclaration, le widget prépare la solution, et le champ est
# noté dans le tirage. La page reçoit la liste des champs avec chaque tirage : elle n’a jamais à relire
# l’énoncé, et un attribut peut être calculé (solution=2*s).
# Solution écartée : lire l’appel sans l’exécuter, par une grammaire écrite en JavaScript (l’ancien
# runtime/template.js), pour que la page connaisse ses champs sans Python. C’était un second lecteur de
# la même écriture, qui refusait toute expression et devait déclarer chaque attribut des deux côtés.
class _FieldError(Exception):
    """Erreur de l’auteur dans l’appel d’un champ : le message est affiché tel quel, avec sa ligne."""


_widget_modules = {}


def _widget_module(name, source):
    """Module d’un widget.py, exécuté une fois par texte ; None pour un widget sans Python."""
    import types
    if source is None:
        return None
    key = (name, source)
    if key not in _widget_modules:
        module = types.ModuleType("pywims_widget_" + name)
        exec(compile(source, "widgets/{}/widget.py".format(name), "exec"), module.__dict__)
        _widget_modules[key] = module
    return _widget_modules[key]


# Noms qu’un champ ne peut pas porter : la saisie arrive dans la variable de ce nom, qui écraserait une
# variable du contrat de question ou un outil de pywims (les mots-clés de Python sont refusés à part).
_RESERVED_FIELD_NAMES = {"ok_answer", "feedback", "math_expression", "mcq", "tex", "ANY", "pywims"}

_TYPE_DESCRIPTIONS = {
    "integer": "un entier",
    "number": "un nombre positif, par exemple 0.01",
    "text": "un texte entre guillemets",
    "boolean": "true ou false",
}


def _number_text(value):
    """Écriture décimale d’un nombre positif (une tolérance), gardée en texte pour rester exacte ; ou None."""
    sympy = _sys.modules.get("sympy")
    if isinstance(value, float) or (sympy is not None and isinstance(value, sympy.Float)):
        text = _float_text(value)
    else:
        ratio = _ratio(value)
        exact = None if ratio is None else _finite_decimal(ratio)
        if exact is None:
            return None
        text = _plain_decimal(exact)
    return None if text.startswith("-") or text in ("nan", "inf") else text


def _attribute(value, expected):
    """Valeur d’un attribut d’après son type déclaré, ou None si elle ne convient pas."""
    if isinstance(expected, list):
        return value if isinstance(value, str) and value in expected else None
    if expected == "value":
        return value
    if expected == "boolean":
        return value if isinstance(value, bool) else None
    if expected == "text":
        return value if isinstance(value, str) else None
    if isinstance(value, (bool, str)):
        return None
    if expected == "integer":
        try:
            return int(value) if int(value) == value else None
        except (TypeError, ValueError):
            return None
    return _number_text(value)


def _field_function(widget, declaration, module, draw, namespace, has_check, in_statement):
    """Fonction que Jinja appelle pour un champ du widget : elle note le champ dans draw et renvoie sa
    marque (« \u0001nom\u0001 »), que la page remplace par le champ. Lève _FieldError."""
    import keyword
    import unicodedata
    schema = declaration["attributes"]

    def field(*args, caller=None, **attributes):
        import jinja2
        # Un mot d’une liste s’écrit avec ou sans guillemets (form=decimal ou form='decimal', § 2.3) :
        # sans guillemets, Jinja y voit une variable inconnue, dont on reprend le nom.
        for key, value in attributes.items():
            words = schema.get(key, {}).get("type")
            if (isinstance(value, jinja2.Undefined) and isinstance(words, list)
                    and value._undefined_name in words):
                attributes[key] = value._undefined_name
        # Une autre variable inconnue arrive comme un objet Undefined, qui n’échoue qu’à son usage : on le
        # fait échouer ici, pour le message habituel (« la variable « s » n’est pas définie… »).
        for value in (*args, *attributes.values()):
            if isinstance(value, jinja2.Undefined):
                value._fail_with_undefined_error()
        if not in_statement:
            raise _FieldError("un champ de réponse ({}) n’a sa place que dans l’énoncé.".format(widget))
        if len(args) != 1 or not isinstance(args[0], str):
            raise _FieldError("{0}(…) : le premier argument est le nom du champ, entre guillemets, par exemple "
                              "{0}('answer', …), et les autres s’écrivent nom=valeur.".format(widget))
        name = unicodedata.normalize("NFKC", args[0])
        if not name.isidentifier() or keyword.iskeyword(name) or name in _RESERVED_FIELD_NAMES:
            raise _FieldError("« {} » ne peut pas être le nom d’un champ : choisissez un nom de variable Python, "
                              "ni réservé ni mot-clé.".format(name))
        where = "le champ « {} » ({})".format(name, widget)
        if any(known["name"] == name for known in draw["fields"]):
            raise _FieldError("{} apparaît deux fois dans l’énoncé : deux champs ne portent jamais le même nom, "
                              "et un champ ne peut pas être placé dans un {{% for %}}.".format(where))
        if name in namespace:
            raise _FieldError("{} porte le nom d’une variable de « question_setup » : renommez l’un des "
                              "deux.".format(where))
        block = caller is not None
        if block and not declaration["block"]:
            raise _FieldError("{} ne s’écrit pas en bloc : écrivez {{{{ {}('{}', …) }}}}.".format(where, widget, name))
        values = {}
        for key, value in attributes.items():
            if key not in schema:
                raise _FieldError("{} : attribut « {} » inconnu.".format(where, key))
            expected = schema[key]
            if block and expected.get("block_supplies"):
                raise _FieldError("{} : l’attribut « {} » est inutile dans un bloc, qui écrit ses choix, marqués "
                                  "[x] (bon) ou [ ] (mauvais).".format(where, key))
            if not block and expected.get("block_only"):
                raise _FieldError("{} : l’attribut « {} » n’existe que dans un bloc ({{% call {}(…) %}} … "
                                  "{{% endcall %}}) ; avec une liste, tirez les choix avec mcq.".format(where, key, widget))
            converted = _attribute(value, expected["type"])
            if converted is None:
                wanted = expected["type"]
                description = ("l’une des valeurs " + ", ".join(wanted) if isinstance(wanted, list)
                               else _TYPE_DESCRIPTIONS[wanted])
                raise _FieldError("{} : l’attribut « {} » doit être {}, et non {!r}.".format(where, key, description, value))
            values[key] = converted
        try:
            if block:
                values.update(module.read_block(caller(), values))
            for key, expected in schema.items():
                if expected.get("required") and key not in values:
                    raise TypeError("il faut indiquer {0}, par exemple {0}=variable.".format(key))
            if declaration["needs_check"] and not has_check:
                raise TypeError("ce champ exige un « question_check » : une formule se corrige par comparaison "
                                "symbolique, par exemple simplify(math_expression(saisie) - solution) == 0.")
            prepared = module.prepare(values)
        except TypeError as error:
            raise _FieldError("{}{} : {}".format(where, ", écrit en bloc" if block else "", error)) from None
        # Attributs utiles à la page : ceux qui ne portent pas une valeur de l’auteur (solution, choix).
        draw["fields"].append({"name": name, "type": widget, "attributes": {
            key: value for key, value in values.items() if key in schema and schema[key]["type"] != "value"}})
        draw["solutions"][name] = prepared["solution"]
        # choices : textes affichés ; ranks : rangs dans un bloc (count) ; input : saisie de l’élève qui
        # donne la solution, pour le contrôle de cohérence, quand elle diffère de la solution affichée.
        for key, target in (("choices", "choices"), ("ranks", "ranks"), ("input", "inputs")):
            if prepared.get(key) is not None:
                draw[target][name] = prepared[key]
        return "\u0001{}\u0001".format(name)

    return field


def _read_choice_block(text, attributes, multiple):
    """Choix d’un bloc rendu (§ 10.1) : textes affichés, solution et, avec count, rang de chaque choix
    affiché dans le bloc, remis à « question_check » (§ 10.3)."""
    texts, good = _block_choices(text)
    if not multiple and len(good) != 1:
        raise TypeError("il faut exactement un bon choix [x], et il y en a {}.".format(len(good)))
    count = attributes.get("count")
    if count is not None and count < 2:
        raise TypeError("count doit être au moins 2.")
    shown = _block_ranks(texts, good, count)
    if len(shown) < 2:
        raise TypeError("il faut au moins deux choix.")
    positions = [shown.index(rank) for rank in good]
    result = {"choices": [texts[rank] for rank in shown], "solution": positions if multiple else positions[0]}
    if count is not None:
        result["ranks"] = shown
    return result


def _prepare_choices(attributes, multiple, plain):
    """Choix et solution d’un champ à choix ; plain : liste déroulante, en texte simple (§ 2.9)."""
    try:
        texts = _choice_texts(attributes["choices"], plain=plain)
    except TypeError as error:
        raise TypeError("les choix : {}".format(error)) from None
    try:
        solution = _choice_solution(attributes["solution"], multiple, len(texts))
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


def _prepare_check(namespace, data):
    """Prépare « question_check » (SPECIFICATION.md, §§ 2.6 et 2.8), avant chaque vérification.

    data (JSON) : {"verdicts": {clé: booléen}, "values": {champ: [n, d] ou null}}.
    Les verdicts de la correction par défaut pré-remplissent ok_answer ; chaque champ input_value
    reçoit sa valeur exacte, lue par la page (runtime/correction.js). Le feedback d’une vérification
    précédente est retiré.
    """
    import json
    data = json.loads(data)
    values = data.get("values") or {}
    if values:
        # Une question peut ne pas importer SymPy ; la page l’a alors chargé avant cet appel.
        from sympy import Rational
        for name, value in values.items():
            # Rational(n, 1) est un Integer : un entier saisi se compare comme un entier.
            namespace[name] = None if value is None else Rational(int(value[0]), int(value[1]))
    namespace["ok_answer"] = dict(data.get("verdicts") or {})
    namespace.pop("feedback", None)


_CONTROL_NAMES = {"\t": r"\t", "\r": r"\r", "\f": r"\f", "\b": r"\b", "\a": r"\a", "\v": r"\v"}


def _string_errors(source, field):
    r"""Chaînes du code de l’auteur qui contiennent un caractère de contrôle (sauf le retour à la ligne).

    Dans une chaîne ordinaire, Python lit « \frac » comme un saut de page suivi de « rac », et
    « \times » comme une tabulation suivie de « imes » : la formule TeX arrive abîmée à MathJax
    (« Math input error »), sans aucune erreur Python. Un tel caractère n’a presque jamais sa place
    dans une question ; on le signale donc à la compilation, avec la ligne, pour qu’une chaîne brute
    r'…' soit utilisée. Renvoie la liste des messages, en JSON.
    """
    import ast
    import json
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # L’erreur de syntaxe est signalée à l’exécution de « question_setup », avec sa ligne.
        return json.dumps([])
    errors = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            found = sorted({char for char in node.value if ord(char) < 32 and char != "\n"})
            if found:
                names = ", ".join(_CONTROL_NAMES.get(char, "\\x{:02x}".format(ord(char))) for char in found)
                errors.append(
                    "« {} », ligne {} : une chaîne contient un caractère de contrôle ({}), sans doute une "
                    "commande TeX (\\frac, \\times…) dans une chaîne ordinaire ; écrivez-la en chaîne "
                    "brute, r'…'.".format(field, node.lineno, names))
    return json.dumps(errors, ensure_ascii=False)


def _ratio(value):
    """Fraction exacte d’un entier, d’une Fraction ou d’un rationnel SymPy ; None pour un autre objet."""
    import fractions
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return fractions.Fraction(value)
    if isinstance(value, fractions.Fraction):
        return value
    sympy = _sys.modules.get("sympy")
    if sympy is not None and isinstance(value, sympy.Rational):
        return fractions.Fraction(int(value.p), int(value.q))
    return None


def _decimal_tex(exact, digits):
    """Écriture décimale d’un Decimal, avec la virgule « {,} » de TeX : telle quelle, sans zéro final
    (digits None), ou arrondie à digits décimales, au plus proche, les demis vers le haut, avec
    exactement digits décimales (0,50 : l’écriture dit la précision de l’arrondi).

    Arrondi comme en classe : round(2.675, 2) donne 2.67 en Python, car le flottant 2.675 vaut en
    réalité 2.67499999…, alors qu’un élève attend 2,68 ; l’arrondi porte donc sur l’écriture décimale.
    La virgule seule serait suivie d’une espace dans une formule : MathJax la traite en ponctuation.
    """
    import decimal
    if digits is None:
        return _plain_decimal(exact).replace(".", "{,}")
    # La précision par défaut (28 chiffres) ferait échouer quantize sur un grand nombre (10**30).
    with decimal.localcontext() as context:
        context.prec = len(exact.as_tuple().digits) + digits + 10
        exact = exact.quantize(decimal.Decimal(1).scaleb(-digits), rounding=decimal.ROUND_HALF_UP)
    text = format(exact, "f")
    # Un zéro n’a pas de signe : -0,001 arrondi au centième s’écrit 0,00.
    if exact.is_zero():
        text = text.lstrip("-")
    return text.replace(".", "{,}")


def _finite_decimal(ratio):
    """Decimal égal à la fraction si elle s’écrit en décimal fini (dénominateur 2^a 5^b), sinon None."""
    import decimal
    denominator = ratio.denominator
    for factor in (2, 5):
        while denominator % factor == 0:
            denominator //= factor
    if denominator != 1:
        return None
    with decimal.localcontext() as context:
        context.prec = len(str(ratio.numerator)) + len(str(ratio.denominator)) + 10
        return decimal.Decimal(ratio.numerator) / decimal.Decimal(ratio.denominator)


def tex(value, frac=False, dec=False, digits=None):
    r"""Écriture d’un nombre ou d’une expression dans une formule (SPECIFICATION.md, § 2.10).

    C’est l’écriture de chaque {{ valeur }} des modèles, dont les filtres frac et dec sont les options ;
    question_setup l’appelle pour fabriquer un texte, par exemple les choix d’un QCM.
      tex(Rational(3, 4)) → "3/4" ; frac=True → r"\frac{3}{4}" ;
      tex(Rational(9, 10), dec=True) → "0{,}9" (un rationnel sans décimal fini reste une fraction) ;
      tex(sqrt(2), digits=2) → "1{,}41", tex(0.5, digits=2) → "0{,}50" (arrondi des demis vers le haut,
      toujours digits décimales ; digits implique dec) ;
      tex(0.1 + 0.2) → "0.3" (12 chiffres significatifs, avec un point) ; un texte reste tel quel.
    Une expression SymPy est écrite par sympy.latex, fractions en ligne sauf avec frac=True.
    """
    import decimal
    if digits is not None and (isinstance(digits, bool) or not isinstance(digits, int) or digits < 0):
        raise TypeError("tex : le nombre de décimales doit être un entier positif ou nul, et non {!r}.".format(digits))
    decimal_wanted = dec or digits is not None
    sympy = _sys.modules.get("sympy")
    ratio = _ratio(value)
    if ratio is not None:
        if decimal_wanted:
            exact = _finite_decimal(ratio)
            if digits is not None:
                # Un décimal fini est exact, ce qui compte pour un demi (1/8 → 0,13) ; sinon assez de
                # chiffres pour que l’arrondi soit juste (1/3).
                return _decimal_tex(_ratio_decimal(ratio, digits) if exact is None else exact, digits)
            if exact is not None:
                return _decimal_tex(exact, None)
        if ratio.denominator == 1:
            return str(ratio.numerator)
        if frac:
            sign = "-" if ratio < 0 else ""
            return r"{}\frac{{{}}}{{{}}}".format(sign, abs(ratio.numerator), ratio.denominator)
        return "{}/{}".format(ratio.numerator, ratio.denominator)
    is_float = isinstance(value, float) or (sympy is not None and isinstance(value, sympy.Float))
    if is_float:
        if digits is not None:
            # repr donne l’écriture la plus courte qui redonne ce flottant : « 2.675 », pas 2.67499999…
            return _decimal_tex(decimal.Decimal(repr(float(value))), digits)
        text = _float_text(value)
        return text.replace(".", "{,}") if dec else text
    is_real_number = (sympy is not None and isinstance(value, sympy.Basic) and getattr(value, "is_number", False)
                      and value.is_real)
    if decimal_wanted:
        if is_real_number and digits is not None:
            # Assez de chiffres pour que l’arrondi demandé soit exact (sqrt(2), pi…).
            return _decimal_tex(decimal.Decimal(str(sympy.N(value, digits + 30))), digits)
        if is_real_number:
            raise TypeError("tex : {} n’a pas d’écriture décimale exacte ; donnez le nombre de décimales, "
                            "par exemple dec(2).".format(value))
        raise TypeError("tex : dec ne s’applique qu’à un nombre, et non à {!r}.".format(value))
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, (MatrixBase, sympy.Basic)):
            # Matrices entre crochets, comme les champs matriciels, qui s’adaptent mieux à une matrice
            # redimensionnable ; fold_short_frac écrit les fractions courtes en ligne (x^{2} / 2).
            return sympy.latex(value, mat_delim="[", fold_short_frac=not frac)
    return str(value)


def _ratio_decimal(ratio, digits):
    """Decimal assez précis pour arrondir exactement la fraction à digits décimales."""
    import decimal
    with decimal.localcontext() as context:
        context.prec = len(str(abs(ratio.numerator) // ratio.denominator)) + digits + 30
        return decimal.Decimal(ratio.numerator) / decimal.Decimal(ratio.denominator)


def _choice_key(value):
    """Ce qu’affiche un choix, aux espaces près : deux valeurs de même clé sont des doublons."""
    return "".join(_choice_text(value).split())


def _distinct(values, excluded=()):
    """Valeurs sans doublon d’affichage, dans leur ordre, privées de celles de excluded."""
    seen = {_choice_key(value) for value in excluded}
    kept = []
    for value in values:
        key = _choice_key(value)
        if key not in seen:
            seen.add(key)
            kept.append(value)
    return kept


def mcq(correct, wrong, count=4, correct_count=None):
    """Choix d’un QCM tirés au hasard (SPECIFICATION.md, § 10.9).

    Choix unique (correct est une valeur) : renvoie (choices, index), la bonne réponse et
    count - 1 mauvaises tirées dans wrong, mélangées. Choix multiple (correct est une liste) :
    renvoie (choices, indices), correct_count bonnes réponses tirées dans correct (toutes par
    défaut) et des mauvaises pour compléter. Les doublons d’affichage sont retirés, ainsi que les
    mauvaises réponses égales à une bonne : deux distracteurs calculés coïncident souvent.
    Le hasard est celui du module random, donc la graine du tirage.
    """
    import random
    multiple = isinstance(correct, (list, tuple, set))
    if isinstance(wrong, (str, bytes)) or not isinstance(wrong, (list, tuple, set)):
        raise TypeError("mcq : wrong doit être une liste de mauvaises réponses.")
    if isinstance(count, bool) or not isinstance(count, int) or count < 2:
        raise ValueError("mcq : count doit être un entier au moins égal à 2.")
    goods = _distinct(list(correct) if multiple else [correct])
    if multiple:
        wanted = len(goods) if correct_count is None else correct_count
        if isinstance(wanted, bool) or not isinstance(wanted, int) or not 0 <= wanted <= count:
            raise ValueError("mcq : correct_count doit être un entier de 0 à count ({}).".format(count))
        if wanted > len(goods):
            raise ValueError("mcq : {} bonnes réponses demandées, mais correct n’en donne que {} distinctes "
                             "pour ce tirage.".format(wanted, len(goods)))
    else:
        if correct_count is not None:
            raise ValueError("mcq : correct_count ne sert qu’avec une liste de bonnes réponses.")
        wanted = 1
    bads = _distinct(list(wrong), excluded=goods)
    if len(bads) < count - wanted:
        raise ValueError("mcq : il faut {} mauvaises réponses distinctes (et différentes des bonnes), "
                         "mais wrong n’en donne que {} pour ce tirage.".format(count - wanted, len(bads)))
    chosen_goods = random.sample(goods, wanted)
    chosen = [(value, True) for value in chosen_goods] + [(value, False) for value in random.sample(bads, count - wanted)]
    random.shuffle(chosen)
    choices = [value for value, _ in chosen]
    indices = [index for index, (_, good) in enumerate(chosen) if good]
    return (choices, indices) if multiple else (choices, indices[0])


def _template_value(value):
    """Texte d’une valeur, celui de {{ valeur }} : la page le compare quand elle rejoue un tirage (§ 5.1),
    et le compilateur s’en sert pour citer le retour de l’auteur."""
    return tex(value)


# Lecture d’une expression saisie : l’analyseur de SymPy (parse_expr), derrière un filtre. parse_expr
# évalue la saisie par eval ; le filtre ne laisse passer que l’écriture mathématique : sans « _ »,
# guillemets, crochets ni virgule, sans mot-clé Python ni point entre deux noms, une saisie ne peut
# appeler que les fonctions de _FUNCTIONS. Tout autre nom devient un symbole, que l’analyse soit faite
# dans l’espace de noms de l’auteur ou non (E = 3 dans « question_setup » ne change rien).
# Solution écartée : une grammaire écrite pour le projet (opérateurs, priorités, produit implicite) ;
# elle refaisait moins bien ce que fait SymPy (« sin x », « sqrt 2 » étaient lus comme des produits).
_FUNCTIONS = ("cos", "exp", "log", "sin", "sqrt", "tan")
_EXPRESSION_CHARACTERS = _re.compile(r"[0-9A-Za-z+\-*/^(). \t]*")
# Un point qui touche un nom ou une parenthèse : un accès à un attribut (x.diff(x)), pas un décimal.
_ATTRIBUTE_DOT = _re.compile(r"[A-Za-z)]\s*\.|\.\s*[A-Za-z(]")
_NAME = _re.compile(r"[A-Za-z][A-Za-z0-9]*")


def _flat(func, args):
    """Arguments de args, ceux de type func remplacés par leurs propres arguments (a + (b + c))."""
    flat = []
    for arg in args:
        flat.extend(arg.args if arg.func is func else [arg])
    return flat


def _as_written(expr):
    """Expression non évaluée remise sous la forme que SymPy donne à la même écriture d’un auteur.

    Seule la notation est effacée, pour que == compare une saisie à une solution écrite en Python :
    ordre des termes et des facteurs (SymPy ne garde pas celui de l’auteur), parenthèses d’une somme
    ou d’un produit, « e^x » pour exp(x), soustraction et division (SymPy n’a ni l’une ni l’autre :
    x - 3 est x + (-3), x/2 est x·(1/2)), fraction d’entiers déjà irréductible (3/4 est le rationnel
    3/4). Aucun calcul : 6/8, 3/(-4), x + x, sqrt(4), sin(pi), 1.5 restent tels quels.
    """
    import sympy
    from sympy.core.basic import _args_sortkey
    if not expr.args:
        return expr
    args = [_as_written(arg) for arg in expr.args]
    if expr.func is sympy.Pow:
        base, power = args
        if base == sympy.E:
            return sympy.exp(power, evaluate=False)
        # Une division (puissance -1) : 1/q pour un entier q > 0, (ab)^-1 = a^-1·b^-1 comme pour SymPy.
        if power == -1 and base.is_Integer and base > 0:
            return sympy.Rational(1, base)
        if power == -1 and base.func is sympy.Mul:
            return _as_written(sympy.Mul._from_args([sympy.Pow(factor, -1, evaluate=False) for factor in base.args]))
        return sympy.Pow(base, power, evaluate=False)
    if expr.func is sympy.Mul:
        factors = _flat(sympy.Mul, args)
        numbers = [factor for factor in factors if factor.is_Number]
        others = [factor for factor in factors if not factor.is_Number]
        # Le signe d’une soustraction (-1) porte sur le nombre qui suit : x - 3x est x + (-3)·x.
        if len(numbers) >= 2 and numbers[0] == -1:
            numbers = [-numbers[1]] + numbers[2:]
        # p·(1/q) écrit p/q : un rationnel, s’il est déjà irréductible (6/8 reste une division).
        if (len(numbers) == 2 and numbers[0].is_Integer and numbers[1].is_Rational and numbers[1].p == 1
                and numbers[1].q != 1 and sympy.igcd(numbers[0], numbers[1].q) == 1):
            numbers = [sympy.Rational(numbers[0], numbers[1].q)]
        # 1/x : le 1 n’est que la notation de la division, SymPy écrit x^-1.
        if numbers == [1] and any(isinstance(factor, sympy.Pow) and factor.exp == -1 for factor in others):
            numbers = []
        # Nombres en tête, puis l’ordre de SymPy ; _from_args construit sans évaluer.
        factors = numbers + sorted(others, key=_args_sortkey)
        return factors[0] if len(factors) == 1 else sympy.Mul._from_args(factors)
    if expr.func is sympy.Add:
        terms = sorted(_flat(sympy.Add, args), key=lambda term: (not term.is_Number, _args_sortkey(term)))
        return sympy.Add._from_args(terms)
    # Une fonction (sin, log…) : reconstruite sans être évaluée, sin(pi) reste sin(pi).
    return expr.func(*args, evaluate=False)


def math_expression(value):
    """Expression SymPy écrite par un élève (« 2x », « x^2 », « sin x », « ln(x) »), ou None.

    La saisie n’est pas calculée (SPECIFICATION.md, § 2.2) : == la compare à une expression à
    l’ordre des termes près, simplify(a - b) == 0 compare les valeurs.
    """
    import keyword
    import sympy
    from sympy.core.parameters import evaluate
    from sympy.parsing.sympy_parser import (convert_xor, implicit_multiplication_application, parse_expr,
                                            standard_transformations)
    if (not isinstance(value, str) or len(value) > 10000 or not value.strip()
            or not _EXPRESSION_CHARACTERS.fullmatch(value) or "//" in value or _ATTRIBUTE_DOT.search(value)):
        return None
    names = set(_NAME.findall(value))
    if any(keyword.iskeyword(name) for name in names):
        return None
    known = {"e": sympy.E, "pi": sympy.pi, "ln": sympy.log}
    known.update((name, getattr(sympy, name)) for name in _FUNCTIONS)
    known.update((name, sympy.Symbol(name)) for name in names - set(known))
    # Seuls les constructeurs que les transformations insèrent (Add, Mul, Pow pour evaluate=False) ;
    # « __builtins__ » vide, sinon eval ajouterait les fonctions natives de Python.
    constructors = {"__builtins__": {}, "Integer": sympy.Integer, "Float": sympy.Float,
                    "Rational": sympy.Rational, "Symbol": sympy.Symbol,
                    "Add": sympy.Add, "Mul": sympy.Mul, "Pow": sympy.Pow}
    # Produit implicite (« 2x », « sin x ») et « ^ » pour la puissance. Les décimaux restent des
    # décimaux : 1.5 n’est pas 3/2, sauf à comparer les valeurs.
    transformations = standard_transformations + (implicit_multiplication_application, convert_xor)
    try:
        # evaluate=False seul laisse calculer le moins d’en tête : -(x+1) devenait -x - 1. Le contexte
        # evaluate(False) l’empêche.
        with evaluate(False):
            result = parse_expr(value, local_dict=known, global_dict=constructors,
                                transformations=transformations, evaluate=False)
        if not isinstance(result, sympy.Expr):
            return None
        return _as_written(result)
    except Exception:  # Toute erreur d’analyse ou de calcul : la saisie est invalide.
        return None
