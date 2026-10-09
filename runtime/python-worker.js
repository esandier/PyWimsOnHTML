// Script du Web Worker de Python (SPECIFICATION.md, § 3) : une instance Pyodide unique, où chaque
// question a sa propre session. python.js en fait le script du Worker (Blob) : le compilateur et
// les tests le lui donnent après l’avoir lu (setWorkerSource), et le fichier généré l’intègre dans
// un bloc <script type="text/x-worker" id="pywims-worker">, que le navigateur n’exécute pas.
// Il ne s’exécute que dans le Worker : il ne voit aucune variable de la page, et la page ne voit
// rien de lui ; tout passe par des messages.
// Solution écartée : le texte d’une fonction de python.js (pythonWorker.toString()) ; elle semblait
// pouvoir utiliser les variables de python.js, qui n’existaient pas dans le Worker, piège que
// les outils ne signalaient pas.
const indexURL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let pyodide;
let pyodidePromise;
let packageLoadQueue = Promise.resolve();
let pythonOperationQueue = Promise.resolve();
let pywimsModuleSource = null;
const sessions = new Map();
const sessionInitializations = new Map();

// Écrit le module dans les paquets du site, où un simple « import pywims » le trouve, et oublie
// la version déjà importée : les sessions suivantes importent la nouvelle.
function installModule(instance) {
  const sitePackages = instance.runPython("import site; site.getsitepackages()[0]");
  instance.FS.writeFile(`${sitePackages}/pywims.py`, pywimsModuleSource);
  instance.runPython("import importlib, sys; sys.modules.pop('pywims', None); importlib.invalidate_caches()");
}

// Exécute les opérations Python l’une après l’autre : Pyodide n’a qu’un interpréteur, et deux
// questions qui l’utiliseraient en même temps mêleraient leurs graines et leurs variables. Un
// échec est renvoyé à l’appelant sans bloquer les opérations suivantes.
function enqueuePythonOperation(operation) {
  const result = pythonOperationQueue.then(operation);
  pythonOperationQueue = result.catch(() => {});
  return result;
}

// Charge Pyodide une seule fois ; un échec permet de réessayer plus tard.
function ensurePyodide() {
  if (pywimsModuleSource === null) {
    throw new Error("Le module pywims n’est pas disponible : la page ne contient pas runtime/pywims.py.");
  }
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      // Script classique de Pyodide : un Worker créé depuis un Blob ne charge pas de module ES
      // dans tous les navigateurs, alors qu’importScripts y est universel.
      importScripts(`${indexURL}pyodide.js`);
      const instance = await loadPyodide({
        indexURL,
        // Hachage des chaînes fixe : sinon il change à chaque chargement de Pyodide, et avec lui
        // l’ordre d’un set de chaînes ; le tirage rejoué dans le navigateur différerait de celui
        // de la compilation (mesuré sur Pyodide 0.27.7, SPECIFICATION.md § 3).
        env: { PYTHONHASHSEED: "0" }
      });
      installModule(instance);
      pyodide = instance;
      return instance;
    })().catch(error => {
      pyodidePromise = undefined;
      throw error;
    });
  }
  return pyodidePromise;
}

// Charge les paquets Pyodide importés par le code de l’exercice. Le module pywims s’appuie sur
// SymPy : l’importer charge donc aussi SymPy.
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
      // Premier import de chaque bibliothèque, ici, hors de toute limite de temps : celui de SymPy
      // dure quelques secondes, et bien plus quand le navigateur exécute WebAssembly lentement
      // (Edge en « sécurité renforcée » : plus de 30 s mesurées). Fait dans « avant », il était
      // compté comme le calcul de l’exercice et faisait refuser la compilation (SPECIFICATION.md,
      // § 3). Ensuite, l’import de l’exercice retrouve le module déjà chargé. Un module introuvable
      // est laissé à « avant », qui en donnera l’erreur avec sa ligne.
      for (const name of imports) {
        try {
          pyodide.pyimport(name).destroy?.();
        } catch {
          // L’erreur sera signalée par l’exécution de l’exercice.
        }
      }
    })
  );
  packageLoadQueue = loading.catch(() => {});
  return loading;
}

// Espace de noms d’une session prête, ou erreur explicite.
function sessionGlobals(sessionId) {
  const globals = sessions.get(sessionId);
  if (!pyodide || !globals) {
    throw new Error("L’environnement Python n’est pas prêt.");
  }
  return globals;
}

// Valeur Python renvoyée à la page : seules les valeurs simples traversent la frontière du
// Worker. Un objet Python (liste, dictionnaire) est converti en tableau ou en objet.
function toPage(value) {
  if (value && typeof value.toJs === "function") {
    try {
      return value.toJs({ dict_converter: Object.fromEntries });
    } finally {
      value.destroy();
    }
  }
  return value;
}

// Prévient la page qu’un appel limité dans le temps commence : elle lance alors son minuteur.
function notifyStart(callId) {
  if (callId !== undefined) {
    postMessage({ id: callId, started: true });
  }
}

const operations = {
  setModuleSource(source) {
    pywimsModuleSource = source;
    if (pyodide) {
      return enqueuePythonOperation(() => installModule(pyodide));
    }
  },

  // Charge Pyodide et les paquets importés, puis crée l’espace de noms vierge de la question.
  async initialize(sessionId, code) {
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
  },

  // Exécute le code Python d’initialisation ou de correction de l’exercice. callId : appel limité
  // dans le temps ; la page est prévenue quand le calcul commence vraiment, après l’attente dans
  // la file, pour ne compter que la durée du calcul.
  run(sessionId, code, callId) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(async () => {
      notifyStart(callId);
      return toPage(await pyodide.runPythonAsync(code, { globals }));
    });
  },

  // Initialise le hasard avec la graine du tirage puis exécute le code, en une seule opération :
  // aucune autre question ne peut tirer de nombre aléatoire entre les deux.
  runSeeded(sessionId, code, seed, callId) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(async () => {
      notifyStart(callId);
      // NumPy n’est initialisé que s’il a été chargé pour cet exercice.
      pyodide.runPython(`
import importlib.util, random
random.seed(${seed})
if importlib.util.find_spec("numpy") is not None:
    import numpy
    numpy.random.seed(${seed})
`);
      toPage(await pyodide.runPythonAsync(code, { globals }));
    });
  },

  // Rassemble les données d’un tirage (valeurs affichées, solutions, explication) et les erreurs
  // de l’auteur.
  collectDraw(sessionId, spec) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(() => {
      const collect = pyodide.runPython('__import__("pywims")._collect_draw');
      try {
        return JSON.parse(collect(globals, JSON.stringify(spec)));
      } finally {
        collect.destroy();
      }
    });
  },

  // Messages sur les chaînes abîmées d’un champ Python (voir _string_errors) ; utilisé par le
  // compilateur avant de calculer les tirages. Le code est analysé, jamais exécuté.
  async sourceErrors(code, field) {
    await ensurePyodide();
    return enqueuePythonOperation(() => {
      const check = pyodide.runPython('__import__("pywims")._string_errors');
      try {
        return JSON.parse(check(code, field));
      } finally {
        check.destroy();
      }
    });
  },

  // Libère l’espace de noms d’une question ; un nouvel appel à initialize en recrée un vierge.
  dispose(sessionId) {
    const globals = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (globals) {
      return enqueuePythonOperation(() => globals.destroy());
    }
  },

  // Transfère une saisie (texte, matrice ou choix) dans l’espace de noms de la question. Une
  // liste devient une vraie liste Python : l’auteur peut la comparer, par exemple
  // « reponse == bonnes ». null devient None (Pyodide en ferait « jsnull »).
  set(sessionId, name, value) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(() => {
      if (value === null) {
        return pyodide.runPythonAsync(`${name} = None`, { globals });
      }
      if (!Array.isArray(value)) {
        globals.set(name, value);
        return;
      }
      const pythonValue = pyodide.toPy(value);
      try {
        globals.set(name, pythonValue);
      } finally {
        pythonValue.destroy();
      }
    });
  },

  // Textes des choix d’une liste de « avant », convertis comme à la compilation : le navigateur
  // vérifie ainsi que le tirage rejoué affiche les mêmes choix.
  getChoiceTexts(sessionId, name) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(() => {
      if (!globals.has(name)) {
        throw new Error(`Liste de choix inconnue : ${name}`);
      }
      return JSON.parse(pyodide.runPython(
        `__import__("json").dumps(__import__("pywims")._choice_texts(${name}), ensure_ascii=False)`, { globals }
      ));
    });
  },

  // Réinitialise les résultats de correction avant chaque vérification.
  resetAnswers(sessionId) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(async () => {
      await pyodide.runPythonAsync("ok_answer = {}\nglobals().pop('feedback', None)", { globals });
    });
  },

  // Convertit une variable Python en texte destiné aux substitutions du modèle.
  getTemplateValue(sessionId, name) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(() => {
      if (!globals.has(name)) {
        throw new Error(`Variable de question inconnue : ${name}`);
      }
      // __import__ évite d’ajouter le nom « pywims » à l’espace de noms de l’auteur.
      return pyodide.runPython(`__import__("pywims")._template_value(${name})`, { globals });
    });
  },

  // Évalue une condition de correction Python et renvoie sa valeur booléenne.
  getBoolean(sessionId, expression) {
    const globals = sessionGlobals(sessionId);
    return enqueuePythonOperation(async () => Boolean(toPage(await pyodide.runPythonAsync(expression, { globals }))));
  }
};

// Chaque message est un appel : { id, op, args } ; la réponse rappelle id, avec la valeur ou le
// message d’erreur (le traceback Python y figure : le compilateur en tire la ligne fautive).
self.onmessage = async ({ data: { id, op, args } }) => {
  try {
    const value = await operations[op](...args);
    postMessage({ id, ok: true, value, loaded: Boolean(pyodide) });
  } catch (error) {
    postMessage({ id, ok: false, error: error?.message ?? String(error), loaded: Boolean(pyodide) });
  }
};
