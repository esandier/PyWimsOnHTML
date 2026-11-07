"""Rendu des tirages à la compilation (SPECIFICATION.md, §§ 2.10, 2.11 et 3)."""
# Module installé dans Pyodide par le compilateur seul (compiler/draws.js), à côté du module de l’auteur
# (runtime/pywims.py) et du paquet des widgets (widgets/, installé sous le nom pywims_widgets). La page
# générée ne l’emporte pas : elle reçoit chaque tirage déjà rendu, et ne relit jamais l’énoncé.
# Il rend l’énoncé et l’explication par Jinja, où chaque widget est une fonction : un champ est noté dans
# le tirage, un élément écrit son texte. Il contrôle aussi le code Python de l’auteur (string_errors).
import importlib
import re
import sys

import pywims
from pywims import _finite_decimal, _float_text, _plain_decimal, _ratio, _template_value, tex

_environment = None


def jinja():
    """Environnement Jinja des modèles (SPECIFICATION.md, § 2.10), créé une fois.

    StrictUndefined : une variable absente est une erreur, au lieu d’un texte vide qu’on ne voit qu’en
    relisant l’énoncé. Pas d’échappement : l’énoncé est le HTML de l’auteur, et une macro peut produire
    du HTML ; le texte de l’élève n’entre jamais dans un modèle. finalize écrit chaque {{ valeur }}
    par tex, et les filtres frac et dec en sont les options.
    """
    global _environment
    if _environment is None:
        import jinja2
        environment = jinja2.Environment(undefined=jinja2.StrictUndefined, autoescape=False,
                                         keep_trailing_newline=True, finalize=tex)
        environment.filters["frac"] = lambda value: tex(value, frac=True)
        environment.filters["dec"] = lambda value, digits=None: tex(value, dec=True, digits=digits)
        environment.filters["coef"] = coef
        environment.filters["term"] = term
        environment.filters["signed"] = signed
        environment.filters["paren"] = paren
        _environment = environment
    return _environment


# Filtres d’écriture (SPECIFICATION.md, § 2.10) : ils écrivent un nombre déjà calculé, avec son
# signe ou sans coefficient 1, là où chaque question réécrivait sa fonction (signed, linear,
# written…). Fractions en \frac : ces nombres sont des coefficients, dans une formule.
def real_number(value, name):
    """Nombre réel écrit par un filtre, ou TypeError : un filtre ne calcule rien."""
    if isinstance(value, bool) or isinstance(value, str):
        raise TypeError("le filtre {} écrit un nombre, et non {!r}.".format(name, value))
    try:
        return value < 0, value == 0
    except TypeError:
        raise TypeError("le filtre {} écrit un nombre réel, et non {!r}.".format(name, value)) from None


def signed(value):
    """+3, -3 : un nombre précédé de son signe."""
    negative, _ = real_number(value, "signed")
    return tex(value, frac=True) if negative else "+" + tex(value, frac=True)


def paren(value):
    """(-3) pour un négatif, dans un produit ou une puissance ; 3 sinon."""
    negative, _ = real_number(value, "paren")
    return "(" + tex(value, frac=True) + ")" if negative else tex(value, frac=True)


def coef(value):
    """Coefficient en tête d’un terme : 1 ne s’écrit pas, -1 s’écrit « - »."""
    real_number(value, "coef")
    if value == 1:
        return ""
    if value == -1:
        return "-"
    return tex(value, frac=True)


def term(value, variable=""):
    """Terme suivant d’une somme, avec son signe : +3x, -x ; rien pour un coefficient nul."""
    negative, zero = real_number(value, "term")
    if zero:
        return ""
    sign = "-" if negative else "+"
    size = -value if negative else value
    if variable and size == 1:
        return sign + variable
    return sign + tex(size, frac=True) + variable


def template_line(error):
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
JINJA_CODE = re.compile(r"\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}")


def render(namespace, source, field, functions=None, shared=None):
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
    source = JINJA_CODE.sub(lambda code: unicodedata.normalize("NFKC", code.group()), source)
    environment = jinja()
    try:
        names = jinja2.meta.find_undeclared_variables(environment.parse(source))
        template = environment.from_string(source)
    except jinja2.TemplateSyntaxError as error:
        # L’ancienne notation d’un champ, {% input_value 'n' … %}, est pour Jinja une commande inconnue : le
        # message, en anglais, ne dirait pas comment l’écrire.
        tag = re.fullmatch(r"Encountered unknown tag '(\w+)'.*", error.message or "", re.S)
        if tag and tag.group(1) in (functions or {}):
            raise ValueError("« {} », ligne {} : {{% {} … %}} n’existe pas ; un widget s’écrit {{{{ {}('nom', …) }}}}."
                             .format(field, error.lineno, tag.group(1), tag.group(1))) from None
        raise ValueError("« {} », ligne {} : {}.".format(field, error.lineno, error.message)) from None
    # Une variable de l’auteur masque le widget du même nom, comme elle masque une fonction de Jinja
    # (avertissement de collect_draw) : « interval = interval_tex(…) » puis {{ interval }} affiche le texte
    # de l’auteur. Solution écartée (novembre 2026) : le widget d’abord ; {{ interval }} affichait alors la
    # fonction elle-même, dont l’adresse change d’une exécution à l’autre, et le tirage était refusé.
    values = dict(functions or {})
    values.update(namespace)
    values.update(shared or {})
    names = names - (set(functions or {}) - set(namespace) - set(shared or {}))
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
        line = template_line(error)
        where = "« {} »{}".format(field, ", ligne {}".format(line) if line else "")
        if isinstance(error, FieldError):
            raise ValueError("{} : {}".format(where, error)) from None
        undefined = re.fullmatch(r"'([^']+)' is undefined", str(error))
        if undefined:
            raise ValueError("{} : la variable « {} » n’est pas définie par « question_setup ».".format(
                where, undefined.group(1))) from None
        raise ValueError("{} : {}: {}".format(where, type(error).__name__, error)) from None
    return text, names - set(shared or {}), definitions


def is_plain_value(value):
    """Valeur dont le texte est reproductible : ni fonction, ni module, ni classe (leur texte
    contient une adresse, qui change d’une exécution à l’autre)."""
    import types
    return not (callable(value) or isinstance(value, types.ModuleType))


def collect_draw(namespace, spec):
    """Données d’un tirage pour le compilateur, avec la liste des erreurs de l’auteur.

    spec (JSON) : {"statement": modèle, "explanation": modèle ou null, "has_check": booléen,
                   "widgets": {nom: déclaration (widget.json lu)}}
    Les champs sont notés par les widgets que Jinja appelle en rendant l’énoncé (§ 2.11) ; « elements »
    nomme, dans le résultat, les éléments que le tirage emploie, dont la page emporte le style.
    """
    import json
    spec = json.loads(spec)
    errors = []
    # Pour Jinja, none, true et false sont des littéraux : {{ none }} affiche « None » sans lire la
    # variable. Une erreur plutôt qu’un avertissement : l’énoncé serait faux à chaque tirage.
    # « from sympy import * » apporte true et false, les booléens de SymPy : ce ne sont pas des
    # variables de l’auteur, et le modèle ne les lisait pas.
    sympy = sys.modules.get("sympy")
    for name in ("none", "true", "false"):
        if name in namespace and not (sympy and namespace[name] is getattr(sympy, name, None)):
            errors.append("La variable « {} » de « question_setup » est un mot réservé de Jinja "
                          "(la valeur {}) : renommez-la.".format(name, name.capitalize()))
    # Une variable qui porte le nom d’une fonction de Jinja (range, dict…) ou d’un widget la masque dans
    # les modèles : sans effet si le modèle ne s’en sert pas, d’où un avertissement seulement.
    warnings = ["La variable « {} » de « question_setup » masque la fonction « {} » de Jinja dans "
                "l’énoncé : renommez-la.".format(name, name)
                for name in sorted(jinja().globals) if name in namespace]
    # Un élément importé de pywims (from pywims import *) n’est pas une variable de l’auteur : c’est le même
    # élément, que le modèle appelle comme widget (son style entre dans la page). Seule une autre valeur
    # du même nom masque le widget.
    visible = {name: value for name, value in namespace.items()
               if not (name in spec["widgets"] and value is getattr(pywims, name, None))}
    warnings += ["La variable « {} » de « question_setup » masque le widget « {} » dans l’énoncé : "
                 "renommez-la.".format(name, name)
                 for name in sorted(spec["widgets"]) if name in visible]
    state = DrawState(namespace, spec["has_check"], spec["widgets"])
    rendered = {}
    read = set()
    # Définitions {% set %} de l’énoncé, visibles dans l’explication (§ 2.10).
    shared = {}
    for key, field in (("statement", "question_statement"), ("explanation", "question_solution_explanation")):
        if spec.get(key) is None:
            continue
        functions = {name: widget_function(name, declaration, state, in_statement=key == "statement")
                     for name, declaration in spec["widgets"].items()}
        try:
            rendered[key], names, definitions = render(
                visible, spec[key], field, functions=functions, shared=shared if key == "explanation" else None)
            read |= names
            if key == "statement":
                shared = definitions
        except ValueError as error:
            errors.append(str(error))
    context = {name: _template_value(namespace[name]) for name in sorted(read)
               if name in namespace and is_plain_value(namespace[name])}
    return json.dumps({
        "statement": rendered.get("statement"), "explanation": rendered.get("explanation"),
        "context": context, "fields": state.fields, "solutions": state.solutions, "choices": state.choices,
        "ranks": state.ranks, "inputs": state.inputs, "elements": sorted(state.elements),
        "errors": errors, "warnings": warnings,
    }, ensure_ascii=False)


# Widgets (SPECIFICATION.md, § 2.11). Chaque dossier de widgets/ déclare ce qu’il est (widget.json) ;
# son Python (widget.py, facultatif) est un module du paquet pywims_widgets, que le compilateur installe
# dans Pyodide avec ce module. Jinja appelle chaque widget comme une fonction :
# - un champ, écrit {{ input_value('n', solution=s) }} ou en bloc, {% call input_radio('n') %} … : le
#   moteur vérifie les attributs d’après la déclaration, le widget prépare la solution (prepare), et le
#   champ est noté dans le tirage ; la page reçoit la liste des champs et ne relit jamais l’énoncé ;
# - un élément, écrit {{ interval(a, b) }} : le texte que rend son widget (render), le même que
#   « question_check » obtient par « from pywims import interval ».
# Solutions écartées : lire l’appel sans l’exécuter, par une grammaire écrite en JavaScript (l’ancien
# runtime/template.js), second lecteur de la même écriture qui refusait toute expression ; envoyer le
# texte de chaque widget.py à chaque tirage et l’exécuter par exec, où un widget ne pouvait pas en
# importer un autre ni une bibliothèque commune.
class FieldError(Exception):
    """Erreur de l’auteur dans l’appel d’un widget : le message est affiché tel quel, avec sa ligne."""


class DrawState:
    """Tirage en cours de rendu : les champs que notent les widgets, et les éléments employés."""

    def __init__(self, namespace, has_check, widgets):
        self.namespace = namespace
        self.has_check = has_check
        # Noms qu’un champ ne peut pas porter : la saisie arrive dans la variable de ce nom, qui
        # écraserait une variable du contrat de question, un outil de pywims ou un élément (les
        # mots-clés de Python sont refusés à part).
        self.reserved = {"ok_answer", "feedback", "pywims"} | set(pywims.__all__) | set(widgets)
        self.fields = []
        self.solutions = {}
        self.choices = {}
        self.ranks = {}
        self.inputs = {}
        self.elements = set()


def widget_module(name, declaration):
    """Module Python d’un widget (pywims_widgets.<nom>.widget), ou None s’il n’en a pas."""
    if "widget.py" not in declaration["files"]:
        return None
    return importlib.import_module("pywims_widgets.{}.widget".format(name))


def fail_if_undefined(values):
    """Une variable inconnue arrive comme un objet Undefined, qui n’échoue qu’à son usage : on le fait
    échouer ici, pour le message habituel (« la variable « s » n’est pas définie… »). Un mot d’une liste
    écrit sans guillemets (form=decimal) en est une : il s’écrit form='decimal', comme en Jinja."""
    import jinja2
    for value in values:
        if isinstance(value, jinja2.Undefined):
            value._fail_with_undefined_error()


def widget_function(name, declaration, state, in_statement):
    """Fonction que Jinja appelle pour le widget : un champ ou un élément."""
    module = widget_module(name, declaration)
    if declaration["kind"] == "element":
        return element_function(name, module, state)
    return field_function(name, declaration, module, state, in_statement)


def element_function(widget, module, state):
    """Fonction que Jinja appelle pour un élément : le texte que rend son widget, dans l’énoncé comme
    dans l’explication. Lève FieldError."""

    def element(*args, **arguments):
        fail_if_undefined((*args, *arguments.values()))
        state.elements.add(widget)
        try:
            return module.render(*args, **arguments)
        except (TypeError, ValueError) as error:
            # Une erreur d’appel (argument inconnu, manquant) nomme déjà la fonction, render du widget.
            message = str(error)
            raise FieldError(message.replace("render()", widget + "()") if "render()" in message
                             else "{} : {}".format(widget, message)) from None

    return element


TYPE_DESCRIPTIONS = {
    "integer": "un entier",
    "number": "un nombre positif, par exemple 0.01",
    "text": "un texte entre guillemets",
    "boolean": "true ou false",
}


def number_text(value):
    """Écriture décimale d’un nombre positif (une tolérance), gardée en texte pour rester exacte ; ou None."""
    sympy = sys.modules.get("sympy")
    if isinstance(value, float) or (sympy is not None and isinstance(value, sympy.Float)):
        text = _float_text(value)
    else:
        ratio = _ratio(value)
        exact = None if ratio is None else _finite_decimal(ratio)
        if exact is None:
            return None
        text = _plain_decimal(exact)
    return None if text.startswith("-") or text in ("nan", "inf") else text


def attribute(value, expected):
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
    return number_text(value)


def field_function(widget, declaration, module, state, in_statement):
    """Fonction que Jinja appelle pour un champ du widget : elle note le champ dans le tirage et renvoie
    sa marque (« \u0001nom\u0001 »), que la page remplace par le champ. Lève FieldError."""
    import keyword
    import unicodedata
    schema = declaration["attributes"]

    def field(*args, caller=None, **attributes):
        fail_if_undefined((*args, *attributes.values()))
        if not in_statement:
            raise FieldError("un champ de réponse ({}) n’a sa place que dans l’énoncé.".format(widget))
        if len(args) != 1 or not isinstance(args[0], str):
            raise FieldError("{0}(…) : le premier argument est le nom du champ, entre guillemets, par exemple "
                             "{0}('answer', …), et les autres s’écrivent nom=valeur.".format(widget))
        name = unicodedata.normalize("NFKC", args[0])
        if not name.isidentifier() or keyword.iskeyword(name) or name in state.reserved:
            raise FieldError("« {} » ne peut pas être le nom d’un champ : choisissez un nom de variable Python, "
                             "ni réservé ni mot-clé.".format(name))
        where = "le champ « {} » ({})".format(name, widget)
        if any(known["name"] == name for known in state.fields):
            raise FieldError("{} apparaît deux fois dans l’énoncé : deux champs ne portent jamais le même nom, "
                             "et un champ ne peut pas être placé dans un {{% for %}}.".format(where))
        if name in state.namespace:
            raise FieldError("{} porte le nom d’une variable de « question_setup » : renommez l’un des "
                             "deux.".format(where))
        block = caller is not None
        if block and not declaration["block"]:
            raise FieldError("{} ne s’écrit pas en bloc : écrivez {{{{ {}('{}', …) }}}}.".format(where, widget, name))
        values = {}
        for key, value in attributes.items():
            if key not in schema:
                raise FieldError("{} : attribut « {} » inconnu.".format(where, key))
            expected = schema[key]
            if block and expected.get("block_supplies"):
                raise FieldError("{} : l’attribut « {} » est inutile dans un bloc, qui l’écrit.".format(where, key))
            if not block and expected.get("block_only"):
                raise FieldError("{} : l’attribut « {} » n’existe que dans un bloc ({{% call {}(…) %}} … "
                                "{{% endcall %}}).".format(where, key, widget))
            converted = attribute(value, expected["type"])
            if converted is None:
                wanted = expected["type"]
                description = ("l’une des valeurs " + ", ".join(wanted) if isinstance(wanted, list)
                               else TYPE_DESCRIPTIONS[wanted])
                raise FieldError("{} : l’attribut « {} » doit être {}, et non {!r}.".format(where, key, description, value))
            values[key] = converted
        try:
            if block:
                values.update(module.read_block(caller(), values))
            for key, expected in schema.items():
                if expected.get("required") and key not in values:
                    raise TypeError("il faut indiquer {0}, par exemple {0}=variable.".format(key))
            if declaration["needs_check"] and not state.has_check:
                raise TypeError("ce champ exige un « question_check » : une formule se corrige par comparaison "
                               "symbolique, par exemple simplify(math_expression(saisie) - solution) == 0.")
            prepared = module.prepare(values)
        except TypeError as error:
            raise FieldError("{}{} : {}".format(where, ", écrit en bloc" if block else "", error)) from None
        # Attributs utiles à la page : ceux qui ne portent pas une valeur de l’auteur (solution, choix).
        state.fields.append({"name": name, "type": widget, "attributes": {
            key: value for key, value in values.items() if key in schema and schema[key]["type"] != "value"}})
        state.solutions[name] = prepared["solution"]
        # choices : textes affichés ; ranks : rangs dans un bloc (count) ; input : saisie de l’élève qui
        # donne la solution, pour le contrôle de cohérence, quand elle diffère de la solution affichée.
        for key, target in (("choices", state.choices), ("ranks", state.ranks), ("input", state.inputs)):
            if prepared.get(key) is not None:
                target[name] = prepared[key]
        return "\u0001{}\u0001".format(name)

    return field


CONTROL_NAMES = {"\t": r"\t", "\r": r"\r", "\f": r"\f", "\b": r"\b", "\a": r"\a", "\v": r"\v"}


def string_errors(source, field):
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
                names = ", ".join(CONTROL_NAMES.get(char, "\\x{:02x}".format(ord(char))) for char in found)
                errors.append(
                    "« {} », ligne {} : une chaîne contient un caractère de contrôle ({}), sans doute une "
                    "commande TeX (\\frac, \\times…) dans une chaîne ordinaire ; écrivez-la en chaîne "
                    "brute, r'…'.".format(field, node.lineno, names))
    return json.dumps(errors, ensure_ascii=False)
