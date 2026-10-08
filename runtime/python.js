// Python de la page : une instance Pyodide unique, dans un Web Worker (un fil d’exécution séparé), où
// chaque question a sa propre session (createSession). La page ne gèle donc pas pendant le chargement
// de SymPy ou un calcul long (≈ 350 ms de gel mesuré sans Worker), et un calcul sans fin pourra être
// arrêté (SPECIFICATION.md, § 5.1). Chaque appel de l’interface publiée devient un message au Worker,
// et sa réponse revient comme une promesse.
window.PyWimsPython = (() => {
  // ---------------------------------------------------------------------------------------------
  // Code du Worker. Cette fonction n’est jamais appelée dans la page : son texte devient le script
  // du Worker (Blob), ce qui évite un fichier de plus à publier et marche aussi en file://.
  // Elle ne peut donc utiliser aucune variable de la page.
  function pythonWorker() {
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
            throw new Error(`Variable d’exercice inconnue : ${name}`);
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
  }
  // ---------------------------------------------------------------------------------------------

  // Source du module « pywims » (runtime/pywims.py, SPECIFICATION.md § 3). La page générée l’intègre
  // dans un bloc <script type="text/x-python" id="pywims-module">, que le navigateur n’exécute pas ;
  // le compilateur et les tests le fournissent avec setModuleSource, après l’avoir lu.
  let pywimsModuleSource = document.getElementById("pywims-module")?.textContent ?? null;
  let worker = null;
  let loaded = false;
  let nextCallId = 0;
  const pendingCalls = new Map();
  // Nombre de relances du Worker : une session créée avant une relance n’existe plus. Une question
  // compare cette valeur à celle de sa préparation pour savoir qu’elle doit se préparer de nouveau.
  let epoch = 0;

  // Arrête le Worker, par exemple après un calcul trop long : c’est le seul moyen d’interrompre
  // Pyodide sans les en-têtes HTTP que Moodle n’envoie pas (SharedArrayBuffer). Le calcul en cause
  // échoue avec timedOut ; les autres appels en attente échouent avec une erreur « PyWimsRestart »,
  // que les questions savent taire. Le Worker suivant est créé au prochain appel.
  function restart(timedOutId, timedOut) {
    worker.terminate();
    worker = null;
    loaded = false;
    epoch += 1;
    const calls = [...pendingCalls.entries()];
    pendingCalls.clear();
    for (const [id, pending] of calls) {
      clearTimeout(pending.timer);
      if (id === timedOutId) {
        pending.reject(timedOut);
      } else {
        const error = new Error("Le moteur Python a été relancé après un calcul trop long.");
        error.name = "PyWimsRestart";
        pending.reject(error);
      }
    }
  }

  // Crée le Worker au premier appel : une page qui n’utilise pas Python n’en démarre aucun.
  function ensureWorker() {
    if (worker) {
      return worker;
    }
    // L’adresse du Blob n’est pas révoquée : un navigateur peut lire le script du Worker après sa
    // création, et ce petit texte ne coûte presque rien.
    const url = URL.createObjectURL(new Blob([`(${pythonWorker.toString()})()`], { type: "text/javascript" }));
    const current = new Worker(url);
    worker = current;
    // Un Worker arrêté peut encore livrer un message déjà parti : seuls ceux du Worker actuel comptent.
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      const pending = pendingCalls.get(data.id);
      // Début réel d’un calcul limité dans le temps : le minuteur part maintenant.
      if (data.started) {
        if (pending?.timeoutMs) {
          pending.timer = setTimeout(() => {
            const error = new Error(`Le calcul Python a dépassé ${pending.timeoutMs / 1000} s.`);
            error.name = "PyWimsTimeout";
            restart(data.id, error);
          }, pending.timeoutMs);
        }
        return;
      }
      loaded = data.loaded;
      clearTimeout(pending?.timer);
      pendingCalls.delete(data.id);
      if (data.ok) {
        pending?.resolve(data.value);
      } else {
        pending?.reject(new Error(data.error));
      }
    };
    // Erreur du Worker lui-même (script illisible, chargement impossible) : tous les appels en
    // attente échouent avec son message, au lieu d’attendre indéfiniment.
    // Le Worker en panne est oublié : le prochain appel en crée un neuf.
    current.onerror = event => {
      event.preventDefault();
      if (worker !== current) return;
      const error = new Error(`Le moteur Python s’est arrêté : ${event.message || "erreur inconnue"}`);
      for (const pending of pendingCalls.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      pendingCalls.clear();
      current.terminate();
      worker = null;
      loaded = false;
      epoch += 1;
    };
    if (pywimsModuleSource !== null) {
      worker.postMessage({ id: nextCallId++, op: "setModuleSource", args: [pywimsModuleSource] });
    }
    return worker;
  }

  // Appelle une opération du Worker et renvoie la promesse de sa réponse. timeoutMs : durée maximale
  // du calcul (run, runSeeded), comptée à partir de son début réel ; l’identifiant de l’appel est
  // alors passé au Worker, qui signale ce début.
  function call(op, args, { timeoutMs } = {}) {
    const id = nextCallId++;
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject, timeoutMs });
      ensureWorker().postMessage({ id, op, args: timeoutMs ? [...args, id] : args });
    });
  }

  const namePattern = /^[A-Za-z_]\w*$/;

  // Fournit le module pywims lu dans le dossier du projet (compilateur, tests). Si Python tourne
  // déjà, le module est remplacé : un dossier rouvert après une modification de pywims.py prend effet
  // sans recharger la page.
  function setModuleSource(source) {
    if (typeof source !== "string") {
      throw new Error("Le module pywims doit être un texte.");
    }
    pywimsModuleSource = source;
    return worker ? call("setModuleSource", [source]) : Promise.resolve();
  }

  function initialize(code, sessionId = "default") {
    if (typeof code !== "string") {
      throw new Error("Le code Python de l’exercice est invalide.");
    }
    return call("initialize", [sessionId, code]);
  }

  // options.timeoutMs : durée maximale du calcul (SPECIFICATION.md, §§ 3 et 5.1).
  function runSeeded(code, seed, sessionId = "default", options = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error(`Graine de tirage invalide : ${seed}`);
    }
    return call("runSeeded", [sessionId, code, seed], options);
  }

  // Les contrôles des arguments restent dans la page : une donnée invalide échoue tout de suite, avec
  // un message précis, sans aller-retour.
  function setMatrix(name, values, sessionId = "default") {
    if (!namePattern.test(name) ||
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
    return call("set", [sessionId, name, values]);
  }

  // Saisie d’un champ à choix : un indice (choix unique), null si rien n’est choisi, ou la liste des
  // indices cochés (choix multiple).
  function setChoice(name, value, sessionId = "default") {
    const isIndex = item => Number.isInteger(item) && item >= 0 && item < 1000;
    if (!namePattern.test(name) ||
        !(value === null || isIndex(value) || (Array.isArray(value) && value.length <= 1000 && value.every(isIndex)))) {
      throw new Error("La saisie du champ à choix est invalide.");
    }
    return call("set", [sessionId, name, value]);
  }

  function getChoiceTexts(name, sessionId = "default") {
    if (!namePattern.test(name)) {
      throw new Error(`Liste de choix non prise en charge : ${name}`);
    }
    return call("getChoiceTexts", [sessionId, name]);
  }

  function getTemplateValue(name, sessionId = "default") {
    if (!namePattern.test(name)) {
      throw new Error(`Variable de modèle non prise en charge : ${name}`);
    }
    return call("getTemplateValue", [sessionId, name]);
  }

  // options.timeoutMs : durée maximale du calcul, comme pour runSeeded.
  const run = (code, sessionId = "default", options = {}) => call("run", [sessionId, code], options);
  const collectDraw = (spec, sessionId = "default") => call("collectDraw", [sessionId, spec]);
  const sourceErrors = (code, field) => call("sourceErrors", [code, field]);
  // Sans Worker, il n’y a aucune session à libérer (page neuve, ou Worker arrêté).
  const dispose = (sessionId = "default") => (worker ? call("dispose", [sessionId]) : Promise.resolve());
  const set = (name, value, sessionId = "default") => call("set", [sessionId, name, value]);
  const resetAnswers = (sessionId = "default") => call("resetAnswers", [sessionId]);
  const getBoolean = (expression, sessionId = "default") => call("getBoolean", [sessionId, expression]);

  // Lie l’API de réponse à l’espace Python privé d’une question.
  function createSession(sessionId) {
    if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new Error("Identifiant de session Python invalide.");
    }
    return Object.freeze({
      initialize: code => initialize(code, sessionId),
      run: (code, options) => run(code, sessionId, options),
      runSeeded: (code, seed, options) => runSeeded(code, seed, sessionId, options),
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
    isLoaded: () => loaded,
    // Nombre de relances du Worker (voir restart).
    epoch: () => epoch,
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
