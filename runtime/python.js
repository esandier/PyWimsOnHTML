// Instance Pyodide unique de la page ; chaque question y a sa propre session (createSession).
window.PyWimsPython = (() => {
  const pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
  let pyodide;
  let pyodidePromise;
  let packageLoadQueue = Promise.resolve();
  let pythonOperationQueue = Promise.resolve();
  const sessions = new Map();
  const sessionInitializations = new Map();

  // Module « pywims » importé explicitement par les exercices. Ses fonctions internes restent
  // dans son propre espace de noms : une variable de l’auteur ne peut pas les perturber.
  const pywimsModuleSource = String.raw`
"""Outils PyWims : from pywims import py_wims, is_nombre, math_expression, LIBRE"""
import re as _re
import sys as _sys

__all__ = ["py_wims", "is_nombre", "math_expression", "LIBRE"]

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


def _solution_text(value):
    """Solution d’un champ texte, écrite comme un élève la saisirait ; None pour une valeur libre."""
    if _is_libre(value):
        return None
    sympy = _sys.modules.get("sympy")
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


def is_nombre(value):
    """Indique si la valeur est un nombre Python ou SymPy."""
    import sympy
    return isinstance(value, (int, float, sympy.Number, sympy.NumberSymbol))


def _template_value(value):
    """Texte affiché pour une variable de l’énoncé : LaTeX pour les objets SymPy.

    Les matrices sont écrites entre crochets, comme les champs de saisie matriciels : les
    parenthèses ont été essayées, mais s’adaptent moins bien à une matrice redimensionnable.
    """
    sympy = _sys.modules.get("sympy")
    if sympy is not None:
        from sympy.matrices.matrixbase import MatrixBase
        if isinstance(value, (MatrixBase, sympy.Basic)):
            return r"\displaystyle " + sympy.latex(value, mat_delim="[")
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
`;

  function enqueuePythonOperation(operation) {
    const result = pythonOperationQueue.then(operation);
    pythonOperationQueue = result.catch(() => {});
    return result;
  }

  async function ensurePyodide() {
    if (!pyodidePromise) {
      pyodidePromise = import(pyodideUrl).then(({ loadPyodide }) =>
        loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
          // Hachage des chaînes fixe : sinon il change à chaque chargement de Pyodide, et avec lui
          // l’ordre d’un set de chaînes ; le tirage rejoué dans le navigateur différerait de celui
          // de la compilation (mesuré sur Pyodide 0.27.7, SPECIFICATION.md § 3).
          env: { PYTHONHASHSEED: "0" }
        })
      ).then(instance => {
        // Installe le module pywims dans les paquets du site pour qu’un simple import le trouve.
        const sitePackages = instance.runPython("import site; site.getsitepackages()[0]");
        instance.FS.writeFile(`${sitePackages}/pywims.py`, pywimsModuleSource);
        instance.runPython("import importlib; importlib.invalidate_caches()");
        pyodide = instance;
        return instance;
      }).catch(error => {
        pyodidePromise = undefined;
        throw error;
      });
    }
    return pyodidePromise;
  }

  // Charge les paquets Pyodide importés par le code de l’exercice. Le module pywims
  // s’appuie sur SymPy : l’importer charge donc aussi SymPy.
  async function ensurePackages(code) {
    await ensurePyodide();
    const loading = packageLoadQueue.then(() =>
      enqueuePythonOperation(async () => {
        const findImports = pyodide.pyimport("pyodide.code").find_imports;
        const importsProxy = findImports(code);
        const imports = importsProxy.toJs();
        importsProxy.destroy();
        const errors = [];
        const errorCallback = message => errors.push(message);
        if (imports.includes("pywims")) {
          await pyodide.loadPackage("sympy", { errorCallback });
        }
        await pyodide.loadPackagesFromImports(code, { errorCallback });
        if (errors.length) {
          throw new Error(`Échec du chargement des bibliothèques Python : ${errors.join(" ")}`);
        }
      })
    );
    packageLoadQueue = loading.catch(() => {});
    return loading;
  }

  // Charge Pyodide et les paquets importés, puis crée l’espace de noms vierge de la question.
  async function initialize(code, sessionId = "default") {
    if (typeof code !== "string") {
      throw new Error("Le code Python de l’exercice est invalide.");
    }
    if (sessions.has(sessionId)) {
      return;
    }
    if (sessionInitializations.has(sessionId)) {
      return sessionInitializations.get(sessionId);
    }

    const initialization = (async () => {
      await ensurePackages(code);
      let globals;
      try {
        // Rien n’est importé à la place de l’auteur : seul le dictionnaire des résultats est prédéfini.
        await enqueuePythonOperation(async () => {
          globals = pyodide.runPython("dict()");
          await pyodide.runPythonAsync("ok_answer = {}", { globals });
        });
        sessions.set(sessionId, globals);
      } catch (error) {
        globals?.destroy();
        throw error;
      }
    })();
    sessionInitializations.set(sessionId, initialization);
    try {
      await initialization;
    } finally {
      sessionInitializations.delete(sessionId);
    }
  }

  // Exécute le code Python d’initialisation ou de correction de l’exercice.
  function run(code, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    return enqueuePythonOperation(() => pyodide.runPythonAsync(code, { globals }));
  }

  // Initialise le hasard avec la graine du tirage puis exécute le code, en une seule opération :
  // aucune autre question ne peut tirer de nombre aléatoire entre les deux.
  function runSeeded(code, seed, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error(`Graine de tirage invalide : ${seed}`);
    }
    return enqueuePythonOperation(() => {
      // NumPy n’est initialisé que s’il a été chargé pour cet exercice.
      pyodide.runPython(`
import importlib.util, random
random.seed(${seed})
if importlib.util.find_spec("numpy") is not None:
    import numpy
    numpy.random.seed(${seed})
`);
      return pyodide.runPythonAsync(code, { globals });
    });
  }

  // Rassemble les données d’un tirage (valeurs affichées, solutions, explication) et les erreurs de l’auteur.
  function collectDraw(spec, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    return enqueuePythonOperation(() => {
      const collect = pyodide.runPython('__import__("pywims")._collect_draw');
      try {
        return JSON.parse(collect(globals, JSON.stringify(spec)));
      } finally {
        collect.destroy();
      }
    });
  }

  // Messages sur les chaînes abîmées d’un champ Python (voir _string_errors) ; utilisé par le
  // compilateur avant de calculer les tirages. Le code est analysé, jamais exécuté.
  async function sourceErrors(code, field) {
    await ensurePyodide();
    return enqueuePythonOperation(() => {
      const check = pyodide.runPython('__import__("pywims")._string_errors');
      try {
        return JSON.parse(check(code, field));
      } finally {
        check.destroy();
      }
    });
  }

  // Libère l’espace de noms d’une question ; un nouvel appel à initialize en recrée un vierge.
  function dispose(sessionId = "default") {
    const globals = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (globals) {
      return enqueuePythonOperation(() => globals.destroy());
    }
    return Promise.resolve();
  }

  // Transfère une réponse simple depuis JavaScript vers l’espace de noms Python.
  function set(name, value, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    return enqueuePythonOperation(() => globals.set(name, value));
  }

  // Valide et transfère une matrice, puis libère la mémoire Pyodide utilisée.
  function setMatrix(name, values, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    if (!/^[A-Za-z_]\w*$/.test(name) ||
        !Array.isArray(values) ||
        values.length === 0 ||
        values.length > 10 ||
        !values.every(row =>
          Array.isArray(row) &&
          row.length > 0 &&
          row.length <= 10 &&
          row.length === values[0].length &&
          row.every(value => typeof value === "string")
        )) {
      throw new Error("Les données de la matrice saisie sont invalides.");
    }

    return enqueuePythonOperation(() => {
      const pythonValues = pyodide.toPy(values);
      try {
        globals.set(name, pythonValues);
      } finally {
        pythonValues.destroy();
      }
    });
  }

  // Transfère la saisie d’un champ à choix : un indice (choix unique), None si rien n’est choisi, ou
  // la liste des indices cochés (choix multiple). La liste est convertie en vraie liste Python :
  // l’auteur peut la comparer directement, par exemple « reponse == bonnes ».
  function setChoice(name, value, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    const isIndex = item => Number.isInteger(item) && item >= 0 && item < 1000;
    if (!/^[A-Za-z_]\w*$/.test(name) ||
        !(value === null || isIndex(value) || (Array.isArray(value) && value.length <= 1000 && value.every(isIndex)))) {
      throw new Error("La saisie du champ à choix est invalide.");
    }
    return enqueuePythonOperation(() => {
      // Pyodide convertit le null de JavaScript en « jsnull », pas en None : on affecte None en Python.
      if (value === null) {
        return pyodide.runPythonAsync(`${name} = None`, { globals });
      }
      if (!Array.isArray(value)) {
        return globals.set(name, value);
      }
      const pythonValue = pyodide.toPy(value);
      try {
        globals.set(name, pythonValue);
      } finally {
        pythonValue.destroy();
      }
    });
  }

  // Textes des choix d’une liste de « avant », convertis comme à la compilation : le navigateur
  // vérifie ainsi que le tirage rejoué affiche les mêmes choix.
  function getChoiceTexts(name, sessionId = "default") {
    if (!sessions.has(sessionId) || !/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Liste de choix non prise en charge : ${name}`);
    }
    const globals = sessions.get(sessionId);
    return enqueuePythonOperation(() => {
      if (!globals.has(name)) {
        throw new Error(`Liste de choix inconnue : ${name}`);
      }
      return JSON.parse(pyodide.runPython(
        `__import__("json").dumps(__import__("pywims")._choice_texts(${name}), ensure_ascii=False)`, { globals }
      ));
    });
  }

  // Réinitialise les résultats de correction avant chaque vérification.
  function resetAnswers(sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    return enqueuePythonOperation(() =>
      pyodide.runPythonAsync("ok_answer = {}\nglobals().pop('feedback', None)", { globals })
    );
  }

  // Convertit une variable Python en texte destiné aux substitutions du modèle.
  function getTemplateValue(name, sessionId = "default") {
    if (!sessions.has(sessionId) || !/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Variable de modèle non prise en charge : ${name}`);
    }
    const globals = sessions.get(sessionId);
    return enqueuePythonOperation(() => {
      if (!globals.has(name)) {
        throw new Error(`Variable d’exercice inconnue : ${name}`);
      }
      // __import__ évite d’ajouter le nom « pywims » à l’espace de noms de l’auteur.
      return pyodide.runPython(`__import__("pywims")._template_value(${name})`, { globals });
    });
  }

  // Évalue une condition de correction Python et renvoie sa valeur booléenne.
  function getBoolean(expression, sessionId = "default") {
    const globals = sessions.get(sessionId);
    if (!pyodide || !globals) {
      throw new Error("L’environnement Python n’est pas prêt.");
    }
    return enqueuePythonOperation(() =>
      pyodide.runPythonAsync(expression, { globals }).then(Boolean)
    );
  }

  // Lie l’API de réponse à l’espace Python privé d’une question.
  function createSession(sessionId) {
    if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new Error("Identifiant de session Python invalide.");
    }
    return Object.freeze({
      initialize: code => initialize(code, sessionId),
      run: code => run(code, sessionId),
      runSeeded: (code, seed) => runSeeded(code, seed, sessionId),
      collectDraw: spec => collectDraw(spec, sessionId),
      dispose: () => dispose(sessionId),
      set: (name, value) => set(name, value, sessionId),
      setMatrix: (name, values) => setMatrix(name, values, sessionId),
      setChoice: (name, value) => setChoice(name, value, sessionId),
      getChoiceTexts: name => getChoiceTexts(name, sessionId),
      resetAnswers: () => resetAnswers(sessionId),
      getTemplateValue: name => getTemplateValue(name, sessionId),
      getBoolean: expression => getBoolean(expression, sessionId)
    });
  }

  return Object.freeze({
    // Exposé pour le compilateur : il vérifie que la version chargée par sa page est celle du
    // dossier du projet, celle qui sera intégrée au fichier généré.
    moduleSource: pywimsModuleSource,
    // Indique si Pyodide est déjà chargé (le compilateur adapte son message d’attente).
    isLoaded: () => Boolean(pyodide),
    initialize,
    run,
    runSeeded,
    collectDraw,
    sourceErrors,
    dispose,
    set,
    setMatrix,
    setChoice,
    getChoiceTexts,
    resetAnswers,
    getTemplateValue,
    getBoolean,
    createSession
  });
})();
