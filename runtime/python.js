// Instance Pyodide unique de la page ; chaque question y a sa propre session (createSession).
window.PyWimsPython = (() => {
  const pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
  let pyodide;
  let pyodidePromise;
  let packageLoadQueue = Promise.resolve();
  let pythonOperationQueue = Promise.resolve();
  const sessions = new Map();
  const sessionInitializations = new Map();

  // Source du module « pywims » (runtime/pywims.py, SPECIFICATION.md § 3). La page générée l’intègre
  // dans un bloc <script type="text/x-python" id="pywims-module">, que le navigateur n’exécute pas ;
  // le compilateur et les tests le fournissent avec setModuleSource, après l’avoir lu.
  let pywimsModuleSource = document.getElementById("pywims-module")?.textContent ?? null;

  // Écrit le module dans les paquets du site, où un simple « import pywims » le trouve, et oublie la
  // version déjà importée : les sessions suivantes importent la nouvelle.
  function installModule(instance) {
    const sitePackages = instance.runPython("import site; site.getsitepackages()[0]");
    instance.FS.writeFile(`${sitePackages}/pywims.py`, pywimsModuleSource);
    instance.runPython("import importlib, sys; sys.modules.pop('pywims', None); importlib.invalidate_caches()");
  }

  // Exécute les opérations Python l’une après l’autre : Pyodide n’a qu’un interpréteur, et deux
  // questions qui l’utiliseraient en même temps mêleraient leurs graines et leurs variables. Un échec
  // est renvoyé à l’appelant sans bloquer les opérations suivantes.
  function enqueuePythonOperation(operation) {
    const result = pythonOperationQueue.then(operation);
    pythonOperationQueue = result.catch(() => {});
    return result;
  }

  // Charge Pyodide une seule fois pour toute la page ; un échec permet de réessayer plus tard.
  async function ensurePyodide() {
    if (pywimsModuleSource === null) {
      throw new Error("Le module pywims n’est pas disponible : la page ne contient pas runtime/pywims.py.");
    }
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
        installModule(instance);
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

  // Fournit le module pywims lu dans le dossier du projet (compilateur, tests). Si Pyodide est déjà
  // chargé, le module est remplacé : un dossier rouvert après une modification de pywims.py prend
  // effet sans recharger la page.
  function setModuleSource(source) {
    if (typeof source !== "string") {
      throw new Error("Le module pywims doit être un texte.");
    }
    pywimsModuleSource = source;
    return pyodide ? enqueuePythonOperation(() => installModule(pyodide)) : Promise.resolve();
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
    setModuleSource,
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
