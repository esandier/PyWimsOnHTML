"""Outils PyWims : from pywims import py_wims, is_nombre, math_expression, decimal_fr, LIBRE"""
# Module installé dans Pyodide par runtime/python.js, à la compilation comme dans le fichier généré,
# qui l’intègre tel quel : les tirages calculés et rejoués utilisent ainsi le même code
# (SPECIFICATION.md, § 3). Les fonctions dont le nom commence par « _ » servent au compilateur et à
# la page ; les outils de l’auteur sont listés dans __all__, et chacun de leurs noms doit aussi être
# réservé dans runtime/template.js (un test le vérifie).
import re as _re
import sys as _sys

__all__ = ["py_wims", "is_nombre", "math_expression", "decimal_fr", "LIBRE"]

_libre = None


def __getattr__(name):
    """Crée LIBRE à la demande : SymPy n’est importé que par les exercices qui l’utilisent."""
    global _libre
    if name == "LIBRE":
        if _libre is None:
            import sympy
            # Symbole unique, utilisable dans une Matrix, qui marque une valeur de solution libre.
            _libre = sympy.Dummy("LIBRE")
        return _libre
    raise AttributeError(f"module 'pywims' has no attribute {name!r}")


def _is_libre(value):
    return _libre is not None and value is _libre


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
    (SPECIFICATION.md, § 2.6). Douze chiffres gardent toute valeur qu’un exercice demande.
    """
    import decimal
    import math
    number = float(value)
    if not math.isfinite(number):
        return str(number)
    return _plain_decimal(decimal.Decimal(format(number, ".12g")))


def _solution_text(value):
    """Solution d’un champ texte, écrite comme un élève la saisirait ; None pour une valeur libre."""
    if _is_libre(value):
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
    if _is_libre(value):
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


def _choice_texts(value):
    """Textes des choix d’un champ à choix : un texte reste tel quel, un objet SymPy devient une formule."""
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)) or len(value) < 2:
        raise TypeError("ce doit être une liste d’au moins deux choix.")
    sympy = _sys.modules.get("sympy")
    texts = []
    for choice in value:
        if sympy is not None and isinstance(choice, sympy.Basic):
            # Formule en ligne : les choix restent compacts, côte à côte sur téléphone.
            texts.append(r"\(" + sympy.latex(choice) + r"\)")
        else:
            texts.append(str(choice))
    return texts


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
            errors.append("La variable « {} » de l’énoncé n’est pas définie par « avant ».".format(name))
    dimensions = {}
    for name in spec["dimensions"]:
        value = namespace.get(name)
        try:
            if value is None or int(value) != value:
                raise ValueError
            dimensions[name] = int(value)
        except (TypeError, ValueError):
            errors.append("La dimension « {} » doit être un entier défini par « avant ».".format(name))
    solutions = {}
    choices = {}
    for field in spec["fields"]:
        name, kind, variable = field["name"], field["type"], field["solution"]
        if name in namespace:
            errors.append("Le champ « {} » porte le nom d’une variable de « avant » : renommez l’un des deux.".format(name))
        if variable not in namespace:
            errors.append("La solution « {} » du champ « {} » n’est pas définie par « avant ».".format(variable, name))
            continue
        value = namespace[variable]
        if kind in ("input_radio", "input_checkbox"):
            source = field["choices"]
            if source not in namespace:
                errors.append("Les choix « {} » du champ « {} » ne sont pas définis par « avant ».".format(source, name))
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
    explication = namespace.get("explication_solution")
    if explication is not None and not isinstance(explication, str):
        errors.append("« explication_solution » doit être un texte.")
        explication = None
    return json.dumps({
        "context": context, "dimensions": dimensions, "solutions": solutions,
        "choices": choices, "explication": explication, "errors": errors,
    }, ensure_ascii=False)


_CONTROL_NAMES = {"\t": r"\t", "\r": r"\r", "\f": r"\f", "\b": r"\b", "\a": r"\a", "\v": r"\v"}


def _string_errors(source, field):
    r"""Chaînes du code de l’auteur qui contiennent un caractère de contrôle (sauf le retour à la ligne).

    Dans une chaîne ordinaire, Python lit « \frac » comme un saut de page suivi de « rac », et
    « \times » comme une tabulation suivie de « imes » : la formule TeX arrive abîmée à MathJax
    (« Math input error »), sans aucune erreur Python. Un tel caractère n’a presque jamais sa place
    dans un exercice ; on le signale donc à la compilation, avec la ligne, pour qu’une chaîne brute
    r'…' soit utilisée. Renvoie la liste des messages, en JSON.
    """
    import ast
    import json
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # L’erreur de syntaxe est signalée à l’exécution de « avant », avec sa ligne.
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


def decimal_fr(value, digits):
    """Écriture française d’un nombre arrondi à digits décimales, sans zéros finaux.

    decimal_fr(sqrt(2), 2) → "1,41" ; decimal_fr(1.5, 2) → "1,5" ; decimal_fr(2, 2) → "2".
    Sert de solution quand la réponse attendue s’écrit avec une virgule : la correction par défaut
    ne confond pas la virgule et le point (SPECIFICATION.md, § 2.6).

    L’arrondi se fait sur l’écriture décimale, au plus proche, les cas à mi-chemin vers le haut,
    comme en classe : round(2.675, 2) donne 2.67 en Python, car le flottant 2.675 vaut en réalité
    2.67499999…, alors qu’un élève attend 2,68.
    """
    import decimal
    if isinstance(digits, bool) or not isinstance(digits, int) or digits < 0:
        raise TypeError("decimal_fr : le nombre de décimales doit être un entier positif ou nul.")
    sympy = _sys.modules.get("sympy")
    if isinstance(value, bool):
        raise TypeError("decimal_fr : {!r} n’est pas un nombre.".format(value))
    if isinstance(value, int):
        exact = decimal.Decimal(value)
    elif isinstance(value, float):
        # repr donne l’écriture la plus courte qui redonne ce flottant : « 2.675 », pas 2.67499999…
        exact = decimal.Decimal(repr(value))
    elif sympy is not None and isinstance(value, sympy.Basic) and value.is_real:
        # Assez de chiffres pour que l’arrondi demandé soit exact (sqrt(2), pi, 1/3…).
        exact = decimal.Decimal(str(sympy.N(value, digits + 30)))
    else:
        raise TypeError("decimal_fr : {!r} n’est pas un nombre réel.".format(value))
    # La précision par défaut (28 chiffres) ferait échouer quantize sur un grand nombre (10**30).
    with decimal.localcontext() as context:
        context.prec = len(exact.as_tuple().digits) + digits + 10
        rounded = exact.quantize(decimal.Decimal(1).scaleb(-digits), rounding=decimal.ROUND_HALF_UP)
    return _plain_decimal(rounded).replace(".", ",")


def is_nombre(value):
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


# Seules ces fonctions sont admises comme appels dans une expression saisie.
_FUNCTIONS = ("cos", "exp", "log", "sin", "sqrt", "tan")
_TOKEN = _re.compile(r"\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|([A-Za-z][A-Za-z0-9]*)|(.))")


def math_expression(value):
    """Analyse l’expression ASCII de MathLive avec une grammaire restreinte, sans eval ni sympify."""
    import sympy
    if not isinstance(value, str) or len(value) > 10000:
        return None

    try:
        tokens = []
        position = 0
        while position < len(value):
            match = _TOKEN.match(value, position)
            if not match:
                if value[position:].isspace():
                    break
                raise ValueError("Expression mathématique invalide.")
            number, identifier, operator = match.groups()
            if number:
                tokens.append(("number", number))
            elif identifier:
                tokens.append(("identifier", identifier))
            elif operator in "+-*/^()":
                tokens.append((operator, operator))
            else:
                raise ValueError("Caractère non pris en charge.")
            position = match.end()
        if not tokens or len(tokens) > 1000:
            raise ValueError("Expression vide ou trop complexe.")

        functions = {name: getattr(sympy, name) for name in _FUNCTIONS}
        index = [0]
        nodes = [0]

        # Analyse les opérations par priorité, y compris les produits implicites comme 3x.
        def parse_expression(min_precedence=0, depth=0):
            nodes[0] += 1
            if depth > 64 or nodes[0] > 1000 or index[0] >= len(tokens):
                raise ValueError("Expression trop complexe ou incomplète.")

            kind, token = tokens[index[0]]
            index[0] += 1
            if kind == "number":
                left = sympy.Rational(token)
            elif kind == "identifier":
                if token in functions and index[0] < len(tokens) and tokens[index[0]][0] == "(":
                    index[0] += 1
                    argument = parse_expression(0, depth + 1)
                    if index[0] >= len(tokens) or tokens[index[0]][0] != ")":
                        raise ValueError("Parenthèse fermante manquante.")
                    index[0] += 1
                    left = functions[token](argument)
                elif token == "pi":
                    left = sympy.pi
                elif token == "e":
                    left = sympy.E
                else:
                    left = sympy.Symbol(token)
            elif kind == "(":
                left = parse_expression(0, depth + 1)
                if index[0] >= len(tokens) or tokens[index[0]][0] != ")":
                    raise ValueError("Parenthèse fermante manquante.")
                index[0] += 1
            elif kind in ("+", "-"):
                operand = parse_expression(25, depth + 1)
                left = operand if kind == "+" else -operand
            else:
                raise ValueError("Expression mathématique invalide.")

            while index[0] < len(tokens):
                kind, token = tokens[index[0]]
                precedence = {"+": 10, "-": 10, "*": 20, "/": 20, "^": 30}.get(kind)
                implicit_product = kind in ("number", "identifier", "(")
                if implicit_product:
                    precedence = 20
                if precedence is None or precedence < min_precedence:
                    break
                if not implicit_product:
                    index[0] += 1
                next_precedence = precedence if kind == "^" else precedence + 1
                right = parse_expression(next_precedence, depth + 1)
                if kind == "+":
                    left = sympy.Add(left, right)
                elif kind == "-":
                    left = sympy.Add(left, -right)
                elif kind == "/":
                    left = sympy.Mul(left, sympy.Pow(right, -1))
                elif kind == "^":
                    left = sympy.Pow(left, right)
                else:
                    left = sympy.Mul(left, right)
            return left

        result = parse_expression()
        if index[0] != len(tokens):
            raise ValueError("L’expression contient une syntaxe non prise en charge.")
        return result
    except (ValueError, TypeError, ZeroDivisionError, RecursionError):
        return None
