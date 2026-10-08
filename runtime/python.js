// Python de la page : une instance Pyodide unique, dans un Web Worker (un fil d’exécution séparé), où
// chaque question a sa propre session (createSession). La page ne gèle donc pas pendant le chargement
// de SymPy ou un calcul long (≈ 350 ms de gel mesuré sans Worker), et un calcul sans fin pourra être
// arrêté (SPECIFICATION.md, § 5.1). Chaque appel de l’interface publiée devient un message au Worker,
// et sa réponse revient comme une promesse.
window.PyWimsPython = (() => {
  // Source du module « pywims » (runtime/pywims.py, SPECIFICATION.md § 3). La page générée l’intègre
  // dans un bloc <script type="text/x-python" id="pywims-module">, que le navigateur n’exécute pas ;
  // le compilateur et les tests le fournissent avec setModuleSource, après l’avoir lu.
  let pywimsModuleSource = document.getElementById("pywims-module")?.textContent ?? null;
  // Script du Worker (runtime/python-worker.js), par le même chemin : bloc non exécuté
  // <script type="text/x-worker" id="pywims-worker"> de la page générée, ou setWorkerSource.
  let workerSource = document.getElementById("pywims-worker")?.textContent || null;
  let worker = null;
  let loaded = false;
  let nextCallId = 0;
  const pendingCalls = new Map();
  // Nombre de relances du Worker : une session créée avant une relance n’existe plus. Une question
  // compare cette valeur à celle de sa préparation pour savoir qu’elle doit se préparer de nouveau.
  let epoch = 0;

  // Arrête le Worker, après un calcul trop long (c’est le seul moyen d’interrompre Pyodide sans les
  // en-têtes HTTP que Moodle n’envoie pas, SharedArrayBuffer) ou un changement de script. Le calcul
  // en cause, s’il y en a un, échoue avec timedOut ; les autres appels en attente échouent avec « PyWimsRestart »,
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
    if (workerSource === null) {
      throw new Error("Le moteur Python n’est pas disponible : la page ne contient pas runtime/python-worker.js.");
    }
    // Le Worker est créé depuis un Blob, ce qui marche aussi en file:// ; l’adresse n’est pas
    // révoquée : un navigateur peut lire le script après la création du Worker, et ce texte ne coûte
    // presque rien.
    const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
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
      // Le Worker d’abord : s’il ne peut pas être créé, l’appel échoue sans rester en attente.
      const target = ensureWorker();
      pendingCalls.set(id, { resolve, reject, timeoutMs });
      target.postMessage({ id, op, args: timeoutMs ? [...args, id] : args });
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

  // Fournit le script du Worker lu dans le dossier du projet (compilateur, tests). Un Worker déjà
  // lancé avec un autre script est arrêté, comme après un calcul trop long : le suivant, créé au
  // prochain appel, utilise le nouveau script. Les tirages se calculent ainsi avec le script que le
  // fichier généré intégrera.
  function setWorkerSource(source) {
    if (typeof source !== "string" || !source.trim()) {
      throw new Error("Le script du Worker doit être un texte non vide.");
    }
    const changed = source !== workerSource;
    workerSource = source;
    if (worker && changed) {
      restart(null, null);
    }
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
    setWorkerSource,
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
