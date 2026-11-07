"""Outils PyWims : from pywims import math_expression, mcq, tex, ANY, interval, variation_table"""
# Module de l’auteur (SPECIFICATION.md, § 3) : ce que « question_setup » et « question_check » importent,
# et deux fonctions que la page appelle (_prepare_check, _template_value). Installé dans Pyodide par
# runtime/python-worker.js, à la compilation comme dans le fichier généré, qui l’intègre tel quel : les
# tirages calculés et rejoués utilisent ainsi le même code.
# Le rendu des modèles et la lecture des champs ne servent qu’à la compilation : ils sont dans
# compiler/pywims_draws.py, et la préparation de chaque champ dans son widget (widgets/<nom>/widget.py).
# Solution écartée : un seul module pour tout, dont la page emportait deux fois le nécessaire.
import re as _re
import sys as _sys

try:
    # Éléments (widgets dont « kind » est « element ») : leur liste est écrite à l’installation du paquet
    # pywims_widgets (runtime/python-worker.js). Sans lui (le module essayé seul), aucun élément.
    from pywims_widgets import ELEMENTS as _ELEMENTS
except ImportError:
    _ELEMENTS = ()

__all__ = ["math_expression", "mcq", "tex", "ANY", *_ELEMENTS]

_any_value = None


def __getattr__(name):
    """Crée ANY à la demande : SymPy n’est importé que par les questions qui l’utilisent. Un élément
    (interval, variation_table) est la fonction render de son widget : « question_check » écrit ainsi
    la même notation que l’énoncé, par exemple dans un feedback."""
    global _any_value
    if name == "ANY":
        if _any_value is None:
            import sympy
            # Symbole unique, utilisable dans une Matrix, qui marque une valeur de solution libre.
            _any_value = sympy.Dummy("ANY")
        return _any_value
    if name in _ELEMENTS:
        import importlib
        return importlib.import_module("pywims_widgets.{}.widget".format(name)).render
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


def _choice_text(choice):
    """Texte d’un choix : un texte reste tel quel, un objet SymPy devient une formule en ligne, pour
    que les choix restent compacts, côte à côte sur téléphone."""
    sympy = _sys.modules.get("sympy")
    if sympy is not None and isinstance(choice, sympy.Basic):
        return r"\(" + sympy.latex(choice) + r"\)"
    return str(choice)


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
