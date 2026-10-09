"""Outils PyWims : from pywims import py_wims, is_number, math_expression, decimal_comma, mcq, ANY"""
# Module installé dans Pyodide par runtime/python.js, à la compilation comme dans le fichier généré,
# qui l’intègre tel quel : les tirages calculés et rejoués utilisent ainsi le même code
# (SPECIFICATION.md, § 3). Les fonctions dont le nom commence par « _ » servent au compilateur et à
# la page ; les outils de l’auteur sont listés dans __all__, et chacun de leurs noms doit aussi être
# réservé dans runtime/template.js (un test le vérifie).
import re as _re
import sys as _sys

__all__ = ["py_wims", "is_number", "math_expression", "decimal_comma", "mcq", "ANY"]

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
    lui, le bouton « Solution » afficherait ces chiffres et la correction par défaut les exigerait
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


def _choice_texts(value):
    """Textes des choix d’un champ à choix : un texte reste tel quel, un objet SymPy devient une formule."""
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)) or len(value) < 2:
        raise TypeError("ce doit être une liste d’au moins deux choix.")
    return [_choice_text(choice) for choice in value]


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


def _collect_draw(namespace, spec):
    """Données d’un tirage pour le compilateur, avec la liste des erreurs de l’auteur.

    spec (JSON) : {"variables": [...], "dimensions": [...],
                   "fields": [{"name", "type", "solution", "choices" (champs à choix)}]}
    """
    import json
    spec = json.loads(spec)
    errors = []
    context = {}
    for name in spec["variables"]:
        if name in namespace:
            context[name] = _template_value(namespace[name])
        else:
            errors.append("La variable « {} » de l’énoncé ou de l’explication n’est pas définie par « question_setup ».".format(name))
    dimensions = {}
    for name in spec["dimensions"]:
        value = namespace.get(name)
        try:
            if value is None or int(value) != value:
                raise ValueError
            dimensions[name] = int(value)
        except (TypeError, ValueError):
            errors.append("La dimension « {} » doit être un entier défini par « question_setup ».".format(name))
    solutions = {}
    choices = {}
    for field in spec["fields"]:
        name, kind, variable = field["name"], field["type"], field["solution"]
        if name in namespace:
            errors.append("Le champ « {} » porte le nom d’une variable de « question_setup » : renommez l’un des deux.".format(name))
        if variable not in namespace:
            errors.append("La solution « {} » du champ « {} » n’est pas définie par « question_setup ».".format(variable, name))
            continue
        value = namespace[variable]
        if kind in ("input_radio", "input_checkbox"):
            source = field["choices"]
            if source not in namespace:
                errors.append("Les choix « {} » du champ « {} » ne sont pas définis par « question_setup ».".format(source, name))
                continue
            try:
                choices[name] = _choice_texts(namespace[source])
            except TypeError as error:
                errors.append("Les choix « {} » du champ « {} » : {}".format(source, name, error))
                continue
            try:
                solutions[name] = _choice_solution(value, kind == "input_checkbox", len(choices[name]))
            except TypeError as error:
                errors.append("La solution « {} » du champ « {} » : {}".format(variable, name, error))
        elif kind == "input_value":
            try:
                solutions[name] = _value_solution(value)
            except TypeError as error:
                errors.append("La solution « {} » du champ « {} » : {}".format(variable, name, error))
        elif kind in ("input_text", "input_math"):
            if _is_matrix(value):
                errors.append("La solution « {} » du champ « {} » doit être une valeur simple, pas une matrice.".format(variable, name))
            elif kind == "input_text":
                solutions[name] = _solution_text(value)
            else:
                solutions[name] = _solution_latex(value)
        else:
            try:
                solutions[name] = _solution_cells(value)
            except TypeError as error:
                errors.append("La solution « {} » du champ « {} » : {}".format(variable, name, error))
    return json.dumps({
        "context": context, "dimensions": dimensions, "solutions": solutions,
        "choices": choices, "errors": errors,
    }, ensure_ascii=False)


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


def py_wims(value):
    """Interprète une saisie de l’élève comme expression SymPy, ou renvoie None."""
    import sympy
    try:
        return sympy.sympify(value, evaluate=False)
    except (sympy.SympifyError, NameError, SyntaxError, IndexError, TypeError):
        return None


def decimal_comma(value, digits):
    """Écriture française d’un nombre arrondi à digits décimales, sans zéros finaux.

    decimal_comma(sqrt(2), 2) → "1,41" ; decimal_comma(1.5, 2) → "1,5" ; decimal_comma(2, 2) → "2".
    Sert de solution quand la réponse attendue s’écrit avec une virgule : la correction par défaut
    ne confond pas la virgule et le point (SPECIFICATION.md, § 2.6).

    L’arrondi se fait sur l’écriture décimale, au plus proche, les cas à mi-chemin vers le haut,
    comme en classe : round(2.675, 2) donne 2.67 en Python, car le flottant 2.675 vaut en réalité
    2.67499999…, alors qu’un élève attend 2,68.
    """
    import decimal
    if isinstance(digits, bool) or not isinstance(digits, int) or digits < 0:
        raise TypeError("decimal_comma : le nombre de décimales doit être un entier positif ou nul.")
    sympy = _sys.modules.get("sympy")
    if isinstance(value, bool):
        raise TypeError("decimal_comma : {!r} n’est pas un nombre.".format(value))
    if isinstance(value, int):
        exact = decimal.Decimal(value)
    elif isinstance(value, float):
        # repr donne l’écriture la plus courte qui redonne ce flottant : « 2.675 », pas 2.67499999…
        exact = decimal.Decimal(repr(value))
    elif sympy is not None and isinstance(value, sympy.Basic) and value.is_real:
        # Assez de chiffres pour que l’arrondi demandé soit exact (sqrt(2), pi, 1/3…).
        exact = decimal.Decimal(str(sympy.N(value, digits + 30)))
    else:
        raise TypeError("decimal_comma : {!r} n’est pas un nombre réel.".format(value))
    # La précision par défaut (28 chiffres) ferait échouer quantize sur un grand nombre (10**30).
    with decimal.localcontext() as context:
        context.prec = len(exact.as_tuple().digits) + digits + 10
        rounded = exact.quantize(decimal.Decimal(1).scaleb(-digits), rounding=decimal.ROUND_HALF_UP)
    return _plain_decimal(rounded).replace(".", ",")


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


def is_number(value):
    """Indique si la valeur est un nombre Python ou SymPy."""
    import sympy
    return isinstance(value, (int, float, sympy.Number, sympy.NumberSymbol))


def _template_value(value):
    """Texte affiché pour une variable de l’énoncé : LaTeX pour les objets SymPy.

    Aucun \\displaystyle n’est ajouté : l’auteur choisit la taille des formules, en écrivant
    $\\displaystyle {{f}}$ ou $$ {{f}} $$ ; un ajout d’office grossissait les fractions en ligne et
    s’affichait tel quel hors d’une formule. Les matrices sont écrites entre crochets, comme les
    champs de saisie matriciels, qui s’adaptent mieux à une matrice redimensionnable.
    """
    sympy = _sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, (MatrixBase, sympy.Basic)):
            return sympy.latex(value, mat_delim="[")
    return str(value)


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


def math_expression(value):
    """Expression SymPy écrite par un élève (« 2x », « x^2 », « sin x », « ln(x) »), ou None."""
    import keyword
    import sympy
    from sympy.parsing.sympy_parser import (convert_xor, implicit_multiplication_application, parse_expr,
                                            rationalize, standard_transformations)
    if (not isinstance(value, str) or len(value) > 10000 or not value.strip()
            or not _EXPRESSION_CHARACTERS.fullmatch(value) or "//" in value or _ATTRIBUTE_DOT.search(value)):
        return None
    names = set(_NAME.findall(value))
    if any(keyword.iskeyword(name) for name in names):
        return None
    known = {"e": sympy.E, "pi": sympy.pi, "ln": sympy.log}
    known.update((name, getattr(sympy, name)) for name in _FUNCTIONS)
    known.update((name, sympy.Symbol(name)) for name in names - set(known))
    # Seuls les constructeurs que les transformations insèrent ; « __builtins__ » vide, sinon eval
    # ajouterait les fonctions natives de Python.
    constructors = {"__builtins__": {}, "Integer": sympy.Integer, "Float": sympy.Float,
                    "Rational": sympy.Rational, "Symbol": sympy.Symbol}
    # Produit implicite (« 2x », « sin x »), « ^ » pour la puissance, décimaux en fractions (« 1.5 »
    # donne 3/2, comme une saisie exacte).
    transformations = standard_transformations + (implicit_multiplication_application, convert_xor, rationalize)
    try:
        result = parse_expr(value, local_dict=known, global_dict=constructors, transformations=transformations)
    except Exception:  # Toute erreur d’analyse ou de calcul : la saisie est invalide.
        return None
    return result if isinstance(result, sympy.Expr) else None
