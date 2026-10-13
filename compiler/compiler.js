// Interface du compilateur : ouverture du dossier de questions, liste, aperçu sûr et compilation.
// Le format, les tirages, l’assemblage et l’archive sont dans les autres scripts de ce dossier.
// Les fichiers du projet (mise en page, moteur, widgets, styles) sont lus en ligne, à côté de cette
// page (SPECIFICATION.md, § 11.1) ; le dossier choisi par l’utilisateur ne contient que ses questions.
(() => {
  // Fonctions des modules du compilateur (format.js, draws.js, assemble.js, zip.js).
  const { archiveQuestionSource, assembleActivity, assembleQuestion, computeDraws, createQuestionFilename, createZip, fieldKindsLabel, isArchive, isQuestionFile, neededResources, parseQuestionSource, previewPlaceholderDraw, readZip, resourcePaths, splitPastedQuestions, splitQuestionSource, templateWarnings } = PyWimsCompiler;

  const chooseFolderButton = document.getElementById("choose-folder");
  const filePicker = document.getElementById("question-folder");
  const folderName = document.getElementById("folder-name");
  const reloadFolderButton = document.getElementById("reload-folder");
  const otherFolderButton = document.getElementById("other-folder");
  const brandStatus = document.getElementById("brand-status");
  const projectStatus = document.getElementById("project-status");
  const search = document.getElementById("question-search");
  const questionList = document.getElementById("question-list");
  const listEmpty = document.getElementById("list-empty");
  const selectionCount = document.getElementById("selection-count");
  const selectVisibleButton = document.getElementById("select-visible");
  const previewFrame = document.getElementById("preview-frame");
  const previewNotice = document.getElementById("preview-notice");
  const compileButton = document.getElementById("compile-question");
  const multiOutputControls = document.getElementById("multi-output-controls");
  const outputMode = document.getElementById("output-mode");
  const activityTitleInput = document.getElementById("activity-title");
  const activityTitleLabel = document.getElementById("activity-title-label");
  const compactStyleInput = document.getElementById("compact-style");
  const messages = document.getElementById("messages");
  const activityOrder = document.getElementById("activity-order");
  const activityOrderList = document.getElementById("activity-order-list");
  const moveUpButton = document.getElementById("move-up");
  const moveDownButton = document.getElementById("move-down");
  const orderHint = document.getElementById("order-hint");
  const workspace = document.querySelector(".workspace");
  const pasteButton = document.getElementById("paste-questions");
  const backButton = document.getElementById("back-to-list");
  const questionsView = document.getElementById("questions-view");
  const editorView = document.getElementById("editor-view");
  const pasteStatus = document.getElementById("paste-status");

  let questions = [];
  let selectedQuestion;
  // Questions cochées, dans l’ordre de l’activité (SPECIFICATION.md, § 11.9) : un tableau, et non
  // plus un Set, pour pouvoir déplacer une question.
  let selectedQuestions = [];
  // Pastille de rang de chaque question affichée dans la liste, mise à jour sans reconstruire la
  // liste : la reconstruire ferait perdre le focus à la case qu’on vient de cocher.
  const rankBadges = new Map();
  // Questions que la recherche laisse affichées et qu’on peut cocher : celles de « Tout sélectionner ».
  let visibleQuestions = [];
  const messageTimers = new WeakMap();
  const messageFadeDurationMs = 700;

  // Efface un message et annule ses minuteries pour éviter qu’un ancien fondu le réaffiche.
  function clearMessage(element) {
    const timer = messageTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      messageTimers.delete(element);
    }
    element.classList.remove("is-fading");
    element.hidden = true;
    element.textContent = "";
    element.removeAttribute("title");
    element.className = "header-message";
  }

  // Affiche un message ; une durée facultative déclenche ensuite sa disparition en fondu.
  function showMessage(element, text, className = "muted", durationMs = null) {
    const timer = messageTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      messageTimers.delete(element);
    }
    // header-message porte la taille et la coupure du texte : la remplacer faisait déborder un
    // message long sur la ligne du dossier, sur téléphone.
    element.className = `header-message ${className} transient-message`.trim();
    element.textContent = text;
    element.title = text;
    element.hidden = false;

    if (durationMs !== null) {
      messageTimers.set(element, setTimeout(() => {
        element.classList.add("is-fading");
        messageTimers.set(element, setTimeout(() => {
          element.hidden = true;
          element.textContent = "";
          element.removeAttribute("title");
          element.className = "header-message";
          messageTimers.delete(element);
        }, messageFadeDurationMs));
      }, durationMs));
    }
  }

  // Retire le dossier racine ajouté par le sélecteur : chemin relatif au dossier de questions.
  function relativePath(file) {
    const path = file.webkitRelativePath || file.name;
    const firstSlash = path.indexOf("/");
    return firstSlash < 0 ? path : path.slice(firstSlash + 1);
  }

  // Dossier de questions (SPECIFICATION.md, § 11.2). Chrome et Edge donnent à la page un accès
  // durable au dossier (File System Access) : on le mémorise, on le rouvre à la visite suivante,
  // et on relit ses fichiers à la demande. Firefox et Safari n’ont que le sélecteur de dossier :
  // ses fichiers sont figés à l’ouverture, et seul le nom du dernier dossier est rappelé.
  const canRememberFolder = typeof window.showDirectoryPicker === "function";
  let folderHandle = null;
  let rememberedHandle = null;
  // Charte du dossier ouvert : son brand.css, s’il en a un à sa racine (SPECIFICATION.md, § 11.4).
  let folderBrand = null;
  const lastFolderNameKey = "pywims-compilateur:dernier-dossier";

  // Magasin IndexedDB à un seul enregistrement : l’accès au dossier, qui s’y range tel quel.
  function folderStore(mode, action) {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open("pywims-compilateur", 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("dossier");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const request = action(opening.result.transaction("dossier", mode).objectStore("dossier"));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      };
    });
  }
  // Sans mémoire (navigation privée, réglages), le compilateur marche, sans rouvrir le dossier.
  const rememberFolder = handle => folderStore("readwrite", store => store.put(handle, "questions")).catch(() => {});
  const rememberedFolder = () => folderStore("readonly", store => store.get("questions")).catch(() => null);

  // Texte d’un fichier de question : celui d’un .pwq, ou celui du .pwq d’une archive, ses images
  // intégrées (SPECIFICATION.md, § 2.7) ; null pour un .zip qui ne contient pas de question.
  async function questionText(file, path) {
    if (/\.pwq$/i.test(path)) {
      return file.text();
    }
    let files;
    try {
      files = await readZip(await file.arrayBuffer());
    } catch (error) {
      throw new Error(`${path} : ${error.message}`);
    }
    return archiveQuestionSource(files, path);
  }

  // Fichiers de question (.pwq, .pwqa, .zip) d’un dossier et de ses sous-dossiers, avec leur chemin
  // relatif et de quoi les relire. Les dossiers cachés (.git…) sont sautés : ils ne contiennent
  // pas de questions et peuvent compter des milliers de fichiers.
  async function questionFilesOf(directory, prefix = "") {
    const found = [];
    for await (const [name, entry] of directory.entries()) {
      if (name.startsWith(".")) continue;
      if (entry.kind === "directory") {
        found.push(...await questionFilesOf(entry, `${prefix}${name}/`));
      } else if (isQuestionFile(name)) {
        const path = `${prefix}${name}`;
        found.push({
          path,
          handle: entry,
          read: async () => {
            let file;
            try {
              file = await entry.getFile();
            } catch {
              throw new Error(`« ${path} » est introuvable ou illisible : cliquez sur « Relire ».`);
            }
            return questionText(file, path);
          }
        });
      }
    }
    return found;
  }

  // brand.css à la racine d’un dossier ouvert par son accès (Chrome, Edge), ou null.
  async function brandOf(directory) {
    try {
      const entry = await directory.getFileHandle("brand.css");
      return { read: async () => (await entry.getFile()).text() };
    } catch {
      return null;
    }
  }

  // brand.css à la racine du dossier choisi par le sélecteur classique, ou null.
  function brandOfPicker(files) {
    const file = [...files].find(candidate => relativePath(candidate) === "brand.css");
    return file ? { read: () => file.text() } : null;
  }

  // Fichiers de question choisis par le sélecteur classique (Firefox, Safari). Le navigateur les
  // fige à l’ouverture : un fichier modifié ou supprimé depuis ne peut plus être lu. Les dossiers
  // cachés sont sautés, comme avec l’accès durable.
  function questionFilesOfPicker(files) {
    return [...files]
      .map(file => ({ path: relativePath(file), file }))
      .filter(({ path }) => isQuestionFile(path) && !path.split("/").some(part => part.startsWith(".")))
      .map(({ path, file }) => ({
        path,
        read: async () => {
          // Un fichier changé est illisible : l’erreur du navigateur (NotReadableError) est expliquée.
          let bytes;
          try {
            bytes = await file.arrayBuffer();
          } catch {
            throw new Error(`« ${path} » a changé depuis l’ouverture du dossier : rouvrez le dossier, puis compilez de nouveau.`);
          }
          const copy = new Blob([bytes]);
          return questionText(copy, path);
        }
      }));
  }

  // Boutons du dossier selon l’état : ouvert (nom, « Relire » sur Chrome et Edge), mémorisé mais
  // fermé (« Rouvrir « nom » » et « Autre dossier »), ou aucun (nom du dernier dossier rappelé
  // sur Firefox et Safari).
  function updateFolderControls(openName = null) {
    reloadFolderButton.hidden = !(openName && folderHandle);
    otherFolderButton.hidden = Boolean(openName) || !rememberedHandle;
    if (openName) {
      chooseFolderButton.textContent = "Dossier ouvert :";
      chooseFolderButton.title = "Ouvrir un autre dossier";
      folderName.textContent = openName;
    } else if (rememberedHandle) {
      chooseFolderButton.textContent = `Rouvrir « ${rememberedHandle.name} »`;
      chooseFolderButton.title = "Rouvrir le dernier dossier de questions";
      folderName.textContent = "";
    } else {
      chooseFolderButton.textContent = "Ouvrir un dossier de questions";
      chooseFolderButton.removeAttribute("title");
      let lastName = null;
      try {
        lastName = localStorage.getItem(lastFolderNameKey);
      } catch {
        // Stockage indisponible : pas de rappel.
      }
      folderName.textContent = lastName ? `Dernier dossier : ${lastName}` : "Aucun dossier ouvert";
    }
  }

  // Ouvre un dossier par son accès (Chrome, Edge) et le mémorise. keepSelection : relecture du
  // même dossier, qui garde la sélection, la question affichée et la recherche.
  async function openHandle(handle, { keepSelection = false } = {}) {
    folderHandle = handle;
    rememberedHandle = handle;
    rememberFolder(handle);
    showMessage(projectStatus, "Lecture du dossier…");
    try {
      await loadFolder(handle.name, await questionFilesOf(handle), { keepSelection, brand: await brandOf(handle) });
    } catch (error) {
      showMessage(projectStatus, `Le dossier n’a pas pu être lu : ${error.message}`, "error");
    }
  }

  // Choisit un dossier dans la fenêtre du navigateur (Chrome, Edge). « id » fait rouvrir la fenêtre
  // au même endroit d’une fois sur l’autre.
  async function pickFolder() {
    let handle;
    try {
      // En écriture : l’atelier enregistre dans le dossier (§ 11.10) ; le navigateur demande
      // l’autorisation une fois, ici.
      handle = await window.showDirectoryPicker({ id: "pywims-questions", mode: "readwrite" });
    } catch {
      return; // Fenêtre fermée sans choisir : rien ne change.
    }
    await openHandle(handle);
  }

  // Rouvre le dossier mémorisé : le navigateur demande seulement de confirmer l’accès.
  async function reopenFolder() {
    const mode = { mode: "readwrite" };
    if (await rememberedHandle.queryPermission(mode) !== "granted" &&
        await rememberedHandle.requestPermission(mode) !== "granted") {
      showMessage(projectStatus, "Accès au dossier refusé : rouvrez-le, ou choisissez-en un autre.", "error");
      return;
    }
    await openHandle(rememberedHandle);
  }

  // Aperçu : la vraie page de la question, assemblée comme à la compilation, dans un cadre isolé
  // (sandbox sans « allow-same-origin ») car l’énoncé est du HTML écrit par l’auteur. Il affiche
  // d’abord un tirage provisoire où chaque variable porte son nom, boutons inactifs, puis les tirages
  // réels calculés par le Python de cette page, chargé une seule fois ; la question fonctionne alors
  // comme pour l’élève (SPECIFICATION.md, § 3).
  const previewDrawCache = new Map();
  let previewGeneration = 0;
  // Tirages réels de l’aperçu : de quoi essayer « Nouvel énoncé » ; environ 100 ms, Python chargé.
  const previewDrawCount = 5;

  // Python du tirage provisoire : chaque appel reste en attente, donc rien ne se charge ni ne
  // s’affiche en erreur ; ses boutons sont de toute façon inactifs (previewHead).
  const previewPythonStub = `window.PyWimsPython = { createSession: () => new Proxy({}, { get: () => () => new Promise(() => {}) }) };`;
  const previewHead = `<style>.pw-actions { pointer-events: none; opacity: 0.45; }</style>`;

  // Python des tirages réels : un pont vers celui de cette page, déjà chargé, à la place de
  // runtime/python.js. Chaque appel d’une session du cadre part par postMessage ; la réponse revient
  // avec le nombre de relances du Worker (epoch), que question.js compare. frame : numéro du cadre,
  // pour ignorer les messages d’un cadre remplacé. Solution écartée : laisser au cadre son propre
  // Pyodide, rechargé à chaque mise à jour de l’aperçu (6 à 8 s avant chaque première vérification).
  const previewSessionMethods = ["initialize", "run", "runSeeded", "collectDraw", "dispose", "set", "setMatrix",
    "setChoice", "getChoiceTexts", "prepareCheck", "getTemplateValue", "getBoolean"];
  const previewPythonBridge = frame => `window.PyWimsPython = (() => {
  const pending = new Map();
  let nextId = 0;
  let epoch = 0;
  addEventListener("message", ({ source, data }) => {
    const call = source === parent && pending.get(data?.pwPreviewReply);
    if (!call) return;
    pending.delete(data.pwPreviewReply);
    epoch = data.epoch;
    if (data.ok) {
      call.resolve(data.value);
    } else {
      const error = new Error(data.error);
      error.name = data.name;
      call.reject(error);
    }
  });
  const send = (session, method, args) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    parent.postMessage({ pwPreviewCall: id, frame: ${frame}, session, method, args }, "*");
  });
  return Object.freeze({
    epoch: () => epoch,
    createSession: session => Object.freeze(Object.fromEntries(
      ${JSON.stringify(previewSessionMethods)}.map(method => [method, (...args) => send(session, method, args)])))
  });
})();`;

  // Numéro du cadre affiché et sessions Python ouvertes pour lui, libérées quand il est remplacé.
  let previewFrameNumber = 0;
  const previewSessions = new Set();

  // Appels Python du cadre de l’aperçu (previewPythonBridge) : chacun s’exécute dans une session de
  // cette page, au nom préfixé par le numéro du cadre, et la réponse repart vers le cadre.
  addEventListener("message", event => {
    const { data } = event;
    if (event.source !== previewFrame.contentWindow || typeof data?.pwPreviewCall !== "number" ||
        data.frame !== previewFrameNumber) {
      return;
    }
    const reply = message => event.source.postMessage(
      { pwPreviewReply: data.pwPreviewCall, epoch: PyWimsPython.epoch(), ...message }, "*");
    new Promise(resolve => {
      if (!previewSessionMethods.includes(data.method) || !/^[A-Za-z0-9_-]+$/.test(data.session) || !Array.isArray(data.args)) {
        throw new Error("Appel Python de l’aperçu invalide.");
      }
      const sessionId = `apercu${previewFrameNumber}-${data.session}`;
      previewSessions.add(sessionId);
      resolve(PyWimsPython.createSession(sessionId)[data.method](...data.args));
    }).then(value => reply({ ok: true, value }), error => reply({ ok: false, error: error.message, name: error.name }));
  });

  // Ligne d’état au-dessus de l’aperçu (calcul en cours, erreur) ; vide quand l’aperçu est prêt.
  function showPreviewNotice(text, className = "muted") {
    previewNotice.textContent = text;
    previewNotice.className = className;
  }

  // Dernier aperçu affiché : sa question, que l’aperçu vivant garde pendant le calcul.
  let shownPreview = null;
  // L’atelier (Chrome, Edge) : écrire dans le dossier n’est possible que là (§ 11.10).
  const canEdit = canRememberFolder;

  // Assemble la page de la question et l’affiche dans le cadre : avec le tirage provisoire
  // (draws absent), boutons inactifs, ou avec les tirages réels, Python passant par le pont.
  // data-preview : la page montre toujours le premier tirage (question.js).
  async function renderPreviewFrame(fields, question, draws = null) {
    const resources = await readProjectResources(neededResources([fields]));
    // Le cadre n’a pas de Python à lui : ni module pywims ni script du Worker à intégrer.
    delete resources.pywims;
    delete resources.pythonWorker;
    for (const sessionId of previewSessions) {
      PyWimsPython.dispose(sessionId).catch(() => {});
    }
    previewSessions.clear();
    previewFrameNumber += 1;
    resources.python = draws ? previewPythonBridge(previewFrameNumber) : previewPythonStub;
    let page = assembleQuestion(fields, draws ?? [previewPlaceholderDraw(fields)], resources)
      .replace("<body", '<body data-preview="true"');
    if (!draws) {
      page = page.replace("</head>", `${previewHead}</head>`);
    }
    previewFrame.srcdoc = page;
    previewFrame.hidden = false;
    shownPreview = { question };
  }

  // Affiche l’aperçu provisoire tout de suite, puis le remplace par un tirage réel. Une question
  // choisi entre-temps annule la suite (previewGeneration).
  // live : mise à jour de l’atelier après une pause de la frappe (§ 11.10) ; l’aperçu déjà affiché de
  // cette question reste en place pendant le calcul, sans repasser par l’aperçu provisoire.
  async function showPreview(question, { live = false } = {}) {
    previewGeneration += 1;
    const generation = previewGeneration;
    const { fields } = question;
    const keepShown = live && shownPreview?.question === question && !previewFrame.hidden;
    if (!keepShown) {
      try {
        await renderPreviewFrame(fields, question);
      } catch (error) {
        previewFrame.hidden = true;
        showPreviewNotice(`Aperçu impossible : ${error.message}`, "error");
        editor.showPreviewError(question, error.message);
        return;
      }
    }
    if (!previewDrawCache.has(question)) {
      if (!keepShown) {
        showPreviewNotice(PyWimsPython.isLoaded?.()
          ? "Aperçu provisoire : les variables apparaissent sous leur nom, le temps de calculer un tirage…"
          : "Aperçu provisoire : les variables apparaissent sous leur nom. Chargement de Python pour calculer un tirage (10 à 20 secondes la première fois)…");
      }
      const draws = readProjectResources(pythonResources)
        .then(installPythonSources)
        .then(() => computeDraws(fields, { count: previewDrawCount }));
      previewDrawCache.set(question, draws);
      draws.catch(() => previewDrawCache.delete(question));
    }
    try {
      const draws = await previewDrawCache.get(question);
      if (generation !== previewGeneration) {
        return;
      }
      await renderPreviewFrame(fields, question, draws);
      // Aperçu prêt : la ligne d’état ne garde que les avertissements sur l’écriture de l’énoncé.
      const warnings = templateWarnings(fields);
      showPreviewNotice(warnings.join(" "), warnings.length ? "warning" : "muted");
      editor.showPreviewError(question, null);
    } catch (error) {
      if (generation === previewGeneration) {
        showPreviewNotice(`Le tirage n’a pas pu être calculé : ${error.message}`, "error");
        // Dans l’atelier, l’erreur s’affiche aussi sous l’éditeur, avec un lien vers sa ligne.
        editor.showPreviewError(question, error.message);
      }
    }
  }

  // Lit les questions du dossier choisi, sous-dossiers compris, et réinitialise l’interface.
  // sources : [{ path, read }] ; keepSelection garde la sélection d’une relecture du même dossier.
  // Deux textes par question (SPECIFICATION.md, § 11.10) : source, le fichier tel que lu ou écrit dans le
  // dossier ; text, la version de l’atelier, qui sert à l’aperçu et à la compilation. Ils ne diffèrent
  // que le temps d’une pause de la frappe, avant l’enregistrement automatique.
  async function loadFolder(name, sources, { keepSelection = false, brand = null } = {}) {
    // Chemins dans l’ordre de l’activité : « Relire » garde cet ordre.
    const selectedPaths = selectedQuestions.map(question => question.path);
    const shownPath = selectedQuestion?.path;
    // « Relire » garde les questions passées par l’éditeur (leur historique d’annulation) et les
    // questions collées pendant la visite (leur marque « nouvelle »).
    const kept = keepSelection ? questions.filter(question => editor.knows(question) || question.isNew) : [];
    clearMessage(messages);
    clearMessage(projectStatus);
    questions = [];
    selectedQuestion = undefined;
    selectedQuestions = [];
    if (!keepSelection) {
      outputMode.value = "separate";
      activityTitleInput.value = "";
      compactStyleInput.checked = false;
      search.value = "";
    }
    questionList.replaceChildren();
    listEmpty.hidden = false;
    updateCompilationControls();
    // Un aperçu en cours de calcul ne doit pas s’afficher pour le nouveau dossier.
    previewGeneration += 1;
    previewDrawCache.clear();
    previewFrame.hidden = true;
    previewFrame.removeAttribute("srcdoc");
    showPreviewNotice("Choisissez une question dans la liste pour afficher son aperçu.");

    updateFolderControls(name);
    folderBrand = brand;
    brandStatus.textContent = brand
      ? "Charte : brand.css du dossier."
      : "Charte neutre : ajoutez un brand.css au dossier pour celle de votre établissement.";
    brandStatus.hidden = false;
    showMessage(projectStatus, "Chargement des questions…");

    for (const { path, read, handle } of sources) {
      const old = kept.find(question => question.path === path);
      if (old) {
        Object.assign(old, { read, handle });
        questions.push(old);
        // Fichier changé sur le disque (autre éditeur) : l’éditeur reprend la nouvelle version, sauf si
        // une modification attend d’être enregistrée (elle demandera alors).
        try {
          const source = await read();
          if (source !== old.source && !editor.pending().includes(old)) {
            old.source = old.text = source;
            editor.reload(old, source);
          }
        } catch {
          // Fichier disparu : l’onglet garde son texte, que le prochain enregistrement recrée.
        }
        continue;
      }
      const question = { path, read, handle };
      try {
        question.source = await read();
        // Un .zip sans .pwq n’est pas une question : il n’est pas listé (§ 2.7).
        if (question.source === null) continue;
        question.text = question.source;
        question.fields = parseQuestionSource(question.source, path);
      } catch (error) {
        question.error = error;
      }
      questions.push(question);
    }
    if (keepSelection) {
      selectedQuestions = selectedPaths
        .map(path => questions.find(question => question.path === path && !question.error))
        .filter(Boolean);
    }

    const count = questions.length;
    renderQuestionList();
    updateCompilationControls();
    const shown = keepSelection && questions.find(question => question.path === shownPath);
    if (shown) {
      selectQuestion(shown);
    }
    showMessage(
      projectStatus,
      `${count} question${count === 1 ? "" : "s"} chargée${count === 1 ? "" : "s"}.`,
      "success",
      2500
    );
  }

  // Nom d’une question dans la liste : son titre, ou le nom du fichier s’il est illisible.
  function questionLabel(question) {
    return question.fields?.question_title || question.path.split("/").pop();
  }

  // Filtre et trie les questions, puis reconstruit leur liste accessible.
  function renderQuestionList() {
    const query = search.value.trim().toLocaleLowerCase();
    // La liste est reconstruite à chaque changement de la question courante : le bouton qui avait le
    // focus disparaît, et le focus retombait sur la page, où ↑ ↓ ne faisaient plus rien après un
    // clic. On rend le focus au même bouton de la même question.
    const focused = document.activeElement;
    const focusedQuestion = questionList.contains(focused) ? focused.closest("li")?.question : null;
    const focusedRole = focusedQuestion && focused.className;
    questionList.replaceChildren();
    rankBadges.clear();

    const matches = questions.filter(question => {
      const searchable = `${question.fields?.question_title || ""} ${question.fields?.question_keywords || ""} ${question.path}`.toLocaleLowerCase();
      return searchable.includes(query);
    });

    // Regroupement par sous-dossier (SPECIFICATION.md, § 11.3) : le dossier choisi d’abord, puis
    // chaque sous-dossier sous son chemin ; dans chaque groupe, ordre naturel des titres (« (2) »
    // avant « (10) »). Sans sous-dossier, aucun intertitre.
    const naturalOrder = (left, right) => left.localeCompare(right, "fr", { numeric: true });
    const folderOf = question => question.path.includes("/") ? question.path.slice(0, question.path.lastIndexOf("/")) : "";
    matches.sort((left, right) =>
      (folderOf(left) === "" ? -1 : 0) - (folderOf(right) === "" ? -1 : 0) ||
      naturalOrder(folderOf(left), folderOf(right)) ||
      naturalOrder(questionLabel(left), questionLabel(right)));
    const grouped = questions.some(question => folderOf(question) !== "");
    let currentFolder = null;
    for (const question of matches) {
      if (grouped && folderOf(question) !== currentFolder) {
        currentFolder = folderOf(question);
        const heading = document.createElement("li");
        heading.className = "question-group";
        heading.textContent = currentFolder === "" ? folderName.textContent : `${currentFolder}/`;
        questionList.append(heading);
      }
      const item = document.createElement("li");
      item.question = question;
      const selection = document.createElement("input");
      selection.className = "question-selection";
      selection.type = "checkbox";
      selection.checked = selectedQuestions.includes(question);
      selection.disabled = Boolean(question.error);
      selection.setAttribute(
        "aria-label",
        `Inclure « ${questionLabel(question)} » dans la compilation`
      );
      selection.addEventListener("change", () => {
        if (selection.checked) {
          selectedQuestions.push(question);
        } else {
          selectedQuestions = selectedQuestions.filter(other => other !== question);
        }
        updateCompilationControls();
        updateSelectVisibleButton();
      });
      const button = document.createElement("button");
      button.className = "question-preview-button";
      button.type = "button";
      button.setAttribute("aria-current", String(question === selectedQuestion));
      const title = document.createElement("span");
      title.className = "question-title";
      const rank = document.createElement("span");
      rank.className = "question-rank";
      rankBadges.set(question, rank);
      title.append(rank, questionLabel(question));
      const kinds = document.createElement("span");
      kinds.className = "question-fields";
      kinds.textContent = !question.error
        ? fieldKindsLabel(question.fields.question_statement)
        : editor.knows(question) ? "erreur : voir l’éditeur" : "fichier illisible";
      if (question.isNew) {
        const mark = document.createElement("span");
        mark.className = "question-state";
        mark.textContent = "nouvelle";
        kinds.append(mark);
      }
      // Au survol : titre et types entiers (la ligne les coupe), et le chemin, car deux questions
      // peuvent porter le même titre.
      button.title = `${questionLabel(question)} (${kinds.textContent})\n${question.path}`;
      button.append(title, kinds);
      // Un clic montre l’aperçu ; « Éditeur », au bout de la ligne, ouvre la question dans l’atelier (§ 11.10).
      button.addEventListener("click", () => selectQuestion(question));
      item.append(selection, button);
      // Atelier (§ 11.10) : ouvrir la question dans l’éditeur, ou effacer son fichier du dossier.
      if (canEdit) {
        const actions = document.createElement("span");
        actions.className = "question-actions";
        const edit = document.createElement("button");
        edit.className = "question-edit";
        edit.type = "button";
        edit.textContent = "Éditeur";
        edit.title = "Modifier cette question dans l’éditeur (Entrée)";
        edit.addEventListener("click", () => openInEditor(question));
        actions.append(edit);
        if (folderHandle) {
          const remove = document.createElement("button");
          remove.className = "question-delete";
          remove.type = "button";
          remove.textContent = "Supprimer";
          remove.title = "Effacer ce fichier du dossier";
          remove.addEventListener("click", () => deleteQuestion(question));
          actions.append(remove);
        }
        item.append(actions);
      }
      questionList.append(item);
      if (question === focusedQuestion) {
        [...item.querySelectorAll("input, button")].find(element => element.className === focusedRole)?.focus();
      }
    }

    visibleQuestions = matches.filter(question => !question.error);
    updateRanks();
    updateSelectVisibleButton();
    listEmpty.hidden = matches.length > 0;
    if (!questions.length) {
      listEmpty.textContent = "Aucune question (.pwq, .pwqa) dans le dossier choisi.";
    } else if (!matches.length) {
      listEmpty.textContent = "Aucun fichier ne correspond à cette recherche.";
    }
  }

  // « Tout sélectionner » tant qu’une question visible n’est pas cochée, « Tout désélectionner » sinon ;
  // absent quand aucune question visible ne peut être cochée.
  function updateSelectVisibleButton() {
    const allSelected = visibleQuestions.every(question => selectedQuestions.includes(question));
    selectVisibleButton.hidden = visibleQuestions.length === 0;
    selectVisibleButton.textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  }

  // Coche ou décoche d’un coup les questions visibles ; les questions masquées par la recherche
  // gardent leur état (SPECIFICATION.md, § 11.3).
  function toggleVisibleSelection() {
    const allSelected = visibleQuestions.every(question => selectedQuestions.includes(question));
    if (allSelected) {
      selectedQuestions = selectedQuestions.filter(question => !visibleQuestions.includes(question));
    } else {
      // Les questions visibles non cochées s’ajoutent à la fin, dans l’ordre de la liste.
      selectedQuestions.push(...visibleQuestions.filter(question => !selectedQuestions.includes(question)));
    }
    renderQuestionList();
    updateCompilationControls();
  }

  // Affiche l’aperçu de la question choisie et met à jour l’état du bouton de compilation.
  function selectQuestion(question) {
    selectedQuestion = question;
    renderQuestionList();
    if (viewMode === "editor") showInEditor(question);
    if (question.error) {
      previewGeneration += 1;
      previewFrame.hidden = true;
      showPreviewNotice("Impossible de lire cette question.", "error");
      clearMessage(messages);
      showMessage(messages, question.error.message, "error");
      updateCompilationControls();
      return;
    }

    clearMessage(messages);
    showPreview(question);
    updateCompilationControls();
  }

  // Liste ou éditeur (§ 11.10) : « Éditeur » sur une ligne de la liste, « ← » pour revenir. L’éditeur
  // montre toujours la question courante ; il est créé, et CodeMirror chargé, à sa première ouverture.
  let viewMode = "list";
  let editorReady = null;
  function ensureEditor() {
    editorReady ??= PyWimsEditor.create(editorView, {
      // Après une pause de la frappe : le texte devient la version de la question, et l’aperçu suit,
      // avec le même tirage.
      onChange: (question, { text, fields, error }) => {
        const changed = text !== question.text;
        question.text = text;
        if (fields) {
          question.fields = fields;
          delete question.error;
        } else {
          question.error = new Error(error);
        }
        refreshList();
        if (!changed || selectedQuestion !== question) return;
        previewDrawCache.delete(question);
        if (fields) {
          showPreview(question, { live: true });
        } else {
          showPreviewNotice("La question contient une erreur : voir sous l’éditeur.", "error");
        }
      },
      onSave: saveQuestion,
      onPaste: addPastedQuestions
    }).then(created => {
      editor = created;
      return created;
    });
    return editorReady;
  }

  async function setViewMode(mode) {
    viewMode = mode;
    backButton.hidden = mode !== "editor";
    questionsView.hidden = mode !== "list";
    editorView.hidden = mode !== "editor";
    // En mode Éditeur, le panneau de gauche s’élargit aux trois cinquièmes.
    workspace.classList.toggle("is-editing", mode === "editor");
    if (mode === "editor") {
      await ensureEditor();
      if (viewMode === "editor") await showInEditor(selectedQuestion);
    } else {
      await editor.flush?.();
      questionList.querySelector('[aria-current="true"]')?.focus();
    }
  }

  // Montre la question courante dans l’éditeur ; une archive .pwqa ne s’édite pas (§ 11.10).
  async function showInEditor(question) {
    const shown = await ensureEditor();
    if (question && isArchive(question.path)) {
      await shown.show(question, { readOnly: "Une archive .pwqa, qui contient aussi ses images, ne se modifie pas dans l’atelier." });
    } else if (question && typeof question.text !== "string") {
      await shown.show(question, { readOnly: "Ce fichier n’a pas pu être lu." });
    } else {
      await shown.show(question ?? null);
    }
    editor.refresh?.();
  }

  // « Éditeur » d’une ligne, ou Entrée : la question devient la question courante, dans l’éditeur.
  async function openInEditor(question) {
    if (question !== selectedQuestion) selectQuestion(question);
    await setViewMode("editor");
  }

  // « Supprimer » d’une ligne : le fichier est effacé du dossier, après confirmation, car une question
  // écrite par une IA n’est souvent suivie par aucun git. La question suivante de la liste (sinon la
  // précédente) devient la question courante.
  async function deleteQuestion(question) {
    if (!confirm(`Supprimer « ${questionLabel(question)} » du dossier ?\n\n${question.path}\n\nLe fichier sera effacé du disque.`)) return;
    try {
      const mode = { mode: "readwrite" };
      if (await folderHandle.queryPermission(mode) !== "granted" &&
          await folderHandle.requestPermission(mode) !== "granted") {
        throw new Error("le navigateur n’a pas l’autorisation de modifier le dossier");
      }
      // Ce que l’éditeur attend d’enregistrer recréerait le fichier : il oublie la question d’abord.
      await editor.forget?.(question);
      const parts = question.path.split("/");
      let directory = folderHandle;
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
      await directory.removeEntry(parts.at(-1));
    } catch (error) {
      showMessage(projectStatus, `« ${question.path} » n’a pas pu être supprimé : ${error.message}`, "error");
      return;
    }
    const rows = [...questionList.querySelectorAll("li")].filter(row => row.question);
    const index = rows.findIndex(row => row.question === question);
    const neighbour = (rows[index + 1] ?? rows[index - 1])?.question ?? null;
    questions = questions.filter(other => other !== question);
    selectedQuestions = selectedQuestions.filter(other => other !== question);
    previewDrawCache.delete(question);
    if (selectedQuestion === question) {
      if (neighbour) {
        selectQuestion(neighbour);
      } else {
        selectedQuestion = undefined;
        previewGeneration += 1;
        previewFrame.hidden = true;
        showPreviewNotice("Choisissez une question dans la liste pour afficher son aperçu.");
      }
    }
    refreshList();
    questionList.querySelector('[aria-current="true"]')?.focus();
    showMessage(projectStatus, `« ${question.path} » supprimé.`, "success", 2500);
  }

  // Flèches ↑ ↓ dans la liste : la question précédente ou suivante devient la question courante.
  function moveInList(step) {
    const buttons = [...questionList.querySelectorAll(".question-preview-button")];
    const index = buttons.findIndex(button => button.getAttribute("aria-current") === "true");
    const target = buttons[Math.min(buttons.length - 1, Math.max(0, index + step))];
    if (!target || (index >= 0 && buttons[index] === target)) return;
    target.click();
    questionList.querySelector('[aria-current="true"]')?.focus();
  }

  // Adapte les options de compilation au nombre et au mode des questions choisies.
  function updateCompilationControls() {
    const selected = selectedQuestions.filter(question => !question.error);
    const multiple = selected.length > 1;
    const activityMode = multiple && outputMode.value === "activity";
    selectionCount.textContent = selected.length === 0
      ? "Aucune question sélectionnée."
      : `${selected.length} question${selected.length === 1 ? "" : "s"} sélectionnée${selected.length === 1 ? "" : "s"}.`;
    multiOutputControls.hidden = !multiple;
    activityTitleInput.hidden = !activityMode;
    activityTitleLabel.hidden = !activityMode;
    compileButton.disabled = selected.length === 0 ||
      (activityMode && !activityTitleInput.value.trim());
    updateRanks();
    renderActivityOrder();
  }

  // L’ordre ne compte que pour une activité unique : hors de ce mode, ni rang ni liste d’ordre.
  function activityOrderShown() {
    return selectedQuestions.length > 1 && outputMode.value === "activity";
  }

  // Rang de chaque question cochée, à côté de sa case dans la liste des questions.
  function updateRanks() {
    const shown = activityOrderShown();
    for (const [question, badge] of rankBadges) {
      const index = selectedQuestions.indexOf(question);
      badge.textContent = shown && index >= 0 ? String(index + 1) : "";
    }
  }

  // Liste d’ordre de l’activité (SPECIFICATION.md, § 11.9) : rang et titre. La question choisie est
  // celle de l’aperçu ; un clic sur une ligne la choisit. Les flèches, fixes, la déplacent : des
  // flèches sur chaque ligne laissaient le pointeur sur l’autre question après un déplacement, et un
  // second clic au même endroit annulait le premier.
  function renderActivityOrder() {
    activityOrder.hidden = !activityOrderShown();
    activityOrderList.replaceChildren();
    if (activityOrder.hidden) {
      return;
    }
    for (const [index, question] of selectedQuestions.entries()) {
      const item = document.createElement("li");
      item.classList.toggle("is-chosen", question === selectedQuestion);
      const rank = document.createElement("span");
      rank.className = "order-rank";
      rank.textContent = `${index + 1}.`;
      const title = document.createElement("button");
      title.className = "order-title";
      title.type = "button";
      title.textContent = questionLabel(question);
      title.title = question.path;
      title.setAttribute("aria-current", String(question === selectedQuestion));
      title.addEventListener("click", () => selectQuestion(question));
      item.append(rank, title);
      activityOrderList.append(item);
    }
    const chosen = selectedQuestions.indexOf(selectedQuestion);
    moveUpButton.disabled = chosen <= 0;
    moveDownButton.disabled = chosen < 0 || chosen === selectedQuestions.length - 1;
    orderHint.hidden = chosen >= 0;
  }

  // Déplace la question choisie d’un rang, et garde sa ligne visible dans la liste qui défile. Arrivée
  // en tête ou en fin, la flèche utilisée devient inactive : le focus passe à l’autre, pour ne pas
  // retomber sur la page.
  function moveChosen(step) {
    const index = selectedQuestions.indexOf(selectedQuestion);
    const target = index + step;
    if (index < 0 || target < 0 || target >= selectedQuestions.length) {
      return;
    }
    [selectedQuestions[index], selectedQuestions[target]] = [selectedQuestions[target], selectedQuestions[index]];
    updateCompilationControls();
    activityOrderList.children[target].scrollIntoView({ block: "nearest" });
    const [same, other] = step < 0 ? [moveUpButton, moveDownButton] : [moveDownButton, moveUpButton];
    if (same.disabled && document.activeElement === same) {
      other.focus();
    }
  }

  // Fichiers dont Python a besoin pour calculer des tirages, qu’une question ait un « question_check » ou non.
  const pythonResources = ["pywims", "pythonWorker"];

  // Lit les fichiers du projet à côté de cette page (« ../ » depuis compiler/). « no-cache » les fait
  // revalider auprès du serveur à chaque lecture : après une publication, une compilation ne mêle
  // jamais l’ancienne et la nouvelle version (le cache de GitHub Pages dure quelques minutes).
  async function readProjectResources(keys) {
    const entries = await Promise.all(keys.map(async key => {
      const response = await fetch(new URL(`../${resourcePaths[key]}`, location.href), { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Fichier du projet introuvable : « ${resourcePaths[key]} » (${response.status}).`);
      }
      return [key, await response.text()];
    }));
    const resources = Object.fromEntries(entries);
    // La charte du dossier remplace la charte neutre ; relue à chaque fois, comme les questions.
    if (folderBrand && "brandCss" in resources) {
      try {
        resources.brandCss = await folderBrand.read();
      } catch {
        throw new Error("Le brand.css du dossier a changé ou a disparu : rouvrez ou relisez le dossier.");
      }
    }
    return resources;
  }

  // Donne à Python le module pywims et le script du Worker lus avec les autres fichiers : tirages
  // calculés et rejoués utilisent le même code (SPECIFICATION.md, § 3). Un script inchangé ne relance
  // pas le Worker (setWorkerSource) ; le module n’est réinstallé que s’il a changé.
  let installedModule = null;
  async function installPythonSources(resources) {
    PyWimsPython.setWorkerSource(resources.pythonWorker);
    if (resources.pywims !== installedModule) {
      await PyWimsPython.setModuleSource(resources.pywims);
      installedModule = resources.pywims;
    }
  }

  // Assemble la feuille avec les fichiers du projet lus au début de la compilation : une question
  // seule si le titre est absent, une activité sinon.
  // Seuls les fichiers dont ces questions ont besoin sont intégrés : la compilation lit aussi le
  // module pywims et le script du Worker pour calculer les tirages, mais une feuille sans « question_check »
  // ne charge jamais Python et n’a pas à les contenir.
  function compileSheet(questions, resources, activityTitle = null, options = {}) {
    const needed = Object.fromEntries(
      neededResources(questions.map(({ fields }) => fields)).map(key => [key, resources[key]]));
    return activityTitle === null
      ? assembleQuestion(questions[0].fields, questions[0].draws, needed)
      : assembleActivity(activityTitle, questions, needed, options);
  }

  // Éditeur de la question courante, créé à sa première ouverture (ensureEditor) ; d’ici là, et dans les
  // pages de tests, cet éditeur qui ne connaît aucune question.
  let editor = { knows: () => false, pending: () => [], showPreviewError: () => {} };

  // Reconstruit la liste et les contrôles après un changement d’une question.
  function refreshList() {
    renderQuestionList();
    updateCompilationControls();
  }

  // Enregistrement automatique de l’atelier (SPECIFICATION.md, § 11.10) : écrit le texte dans le fichier
  // du dossier. Renvoie { saved, message } ; reload : texte du disque que l’atelier doit reprendre.
  // Un fichier changé sur le disque depuis sa dernière lecture (modifié dans un autre éditeur) n’est
  // remplacé qu’après confirmation ; sinon l’atelier reprend la version du disque.
  async function saveQuestion(question, text) {
    try {
      const mode = { mode: "readwrite" };
      if (await folderHandle.queryPermission(mode) !== "granted" &&
          await folderHandle.requestPermission(mode) !== "granted") {
        return { saved: false, message: "Non enregistré : le navigateur n’a pas l’autorisation de modifier le dossier." };
      }
      let current = null;
      try {
        current = await (await question.handle.getFile()).text();
      } catch {
        // Fichier disparu : il est recréé.
      }
      if (current !== null && current !== question.source &&
          !confirm(`« ${question.path} » a été modifié sur le disque, hors de l’atelier.\n\nOK : le remplacer par la version de l’atelier.\nAnnuler : reprendre la version du disque.`)) {
        question.source = current;
        return { saved: false, reload: current };
      }
      await writeFile(question.handle, text);
    } catch (error) {
      return { saved: false, message: `Non enregistré : ${error.message}` };
    }
    question.source = text;
    return { saved: true };
  }

  // Message bref à côté des boutons « Copier le prompt » et « Coller question(s) ».
  function showPasteStatus(text, className) {
    pasteStatus.textContent = text;
    pasteStatus.title = text;
    pasteStatus.className = `paste-status ${className}`;
  }

  async function writeFile(handle, text) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  // « Coller question(s) » : l’éditeur vide, où l’on colle (§ 11.10). Les questions sont écrites dans le
  // dossier : il doit être ouvert.
  async function pasteQuestions() {
    if (!folderHandle) {
      showPasteStatus("Ouvrez d’abord un dossier de questions.", "error");
      return;
    }
    showPasteStatus("", "");
    viewMode = "editor";
    await setViewMode("editor");
    await editor.showPaste();
  }

  // Nom de fichier libre à la racine du dossier : « x.pwq », sinon « x-2.pwq »…
  async function uniquePath(name) {
    const taken = new Set(questions.map(question => question.path.toLocaleLowerCase()));
    for await (const entry of folderHandle.keys()) taken.add(entry.toLocaleLowerCase());
    const stem = name.replace(/\.pwq$/i, "");
    let candidate = name;
    for (let index = 2; taken.has(candidate.toLocaleLowerCase()); index += 1) {
      candidate = `${stem}-${index}.pwq`;
    }
    return candidate;
  }

  // Écrit les questions d’un texte collé à la racine du dossier (§ 11.10). Une seule : l’éditeur la
  // montre. Plusieurs : retour à la liste, où on les voit toutes, la première étant la question
  // courante ; sinon, on pourrait croire perdues les suivantes. Renvoie un message d’erreur, ou null.
  async function addPastedQuestions(text) {
    const pieces = splitPastedQuestions(text);
    if (!pieces.length) {
      return "Aucune question : le code d’une question commence par une ligne « % », puis « % question_title ».";
    }
    const added = [];
    for (const { name, source } of pieces) {
      const title = splitQuestionSource(source)?.fields.find(field => field.name === "question_title")?.content.trim();
      const path = await uniquePath(name ?? createQuestionFilename(title || "question").replace(/\.html$/, ".pwq"));
      let handle;
      try {
        handle = await folderHandle.getFileHandle(path, { create: true });
        await writeFile(handle, source);
      } catch (error) {
        return `« ${path} » n’a pas pu être écrit : ${error.message}`;
      }
      const question = { path, handle, source, text: source, isNew: true, read: async () => questionText(await handle.getFile(), path) };
      try {
        question.fields = parseQuestionSource(source, path);
      } catch (error) {
        // L’erreur s’affiche sous l’éditeur, où on la corrige.
        question.error = error;
      }
      questions.push(question);
      added.push(question);
    }
    refreshList();
    if (added.length > 1) await setViewMode("list");
    selectQuestion(added[0]);
    if (added.length > 1) {
      showPasteStatus(`${added.length} questions collées, marquées « nouvelle » dans la liste.`, "success");
    }
    return null;
  }

  // Propose le fichier au téléchargement ; l’adresse temporaire est libérée juste après, le temps
  // que le navigateur ait commencé à lire le fichier.
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Compile les questions choisies, seules ou assemblées selon le mode demandé.
  async function downloadQuestion() {
    const selected = selectedQuestions.filter(question => !question.error);
    if (!selected.length) {
      return;
    }

    showMessage(messages, "Export de la sélection…");
    compileButton.disabled = true;
    try {
      // Tous les fichiers du projet sont lus une fois, au début : ceux des tirages et ceux de
      // l’assemblage sont de la même version.
      const keys = [...new Set([...pythonResources, ...neededResources(selected.map(({ fields }) => fields))])];
      const resources = await readProjectResources(keys);
      await installPythonSources(resources);
      // Les questions sont relues : un fichier modifié depuis l’ouverture est compilé dans sa
      // dernière version (Chrome, Edge), ou signalé (Firefox, Safari).
      for (const question of selected) {
        // Une modification de l’atelier pas encore enregistrée est compilée telle quelle (§ 11.10).
        if (question.text !== question.source) continue;
        const source = await question.read();
        if (source === null) {
          throw new Error(`${question.path} : l’archive ne contient plus de fichier .pwq.`);
        }
        if (source !== question.source) {
          question.fields = parseQuestionSource(source, question.path);
          question.source = question.text = source;
          previewDrawCache.delete(question);
        }
      }
      const compiled = [];
      for (const [index, question] of selected.entries()) {
        const label = selected.length > 1 ? `question ${index + 1}/${selected.length}, ` : "";
        showMessage(messages, `Chargement de Python et calcul des tirages (${label}« ${question.fields.question_title} »)…`);
        // Les tirages valident la question en exécutant « question_setup », puis sont intégrés au fichier.
        const draws = await computeDraws(question.fields, {
          onProgress: (done, total) => showMessage(
            messages,
            `Calcul des tirages (${label}« ${question.fields.question_title} ») : ${done}/${total}…`
          )
        }).catch(error => {
          throw new Error(`${question.path} : ${error.message}`);
        });
        compiled.push({ fields: question.fields, draws, path: question.path });
      }
      const html = content => new Blob([content], { type: "text/html;charset=utf-8" });
      if (compiled.length === 1) {
        downloadBlob(html(compileSheet(compiled, resources)), createQuestionFilename(compiled[0].fields.question_title));
      } else if (outputMode.value === "activity") {
        const title = activityTitleInput.value.trim();
        if (!title) {
          throw new Error("Indiquez un titre pour l’activité.");
        }
        downloadBlob(html(compileSheet(compiled, resources, title, { compact: compactStyleInput.checked })), createQuestionFilename(title));
      } else {
        // Pages séparées : une feuille d’une question par fichier.
        const archiveEntries = [];
        for (const question of compiled) {
          archiveEntries.push({
            name: question.path.replace(/\.(pwq|pwqa|zip)$/i, ".html"),
            content: compileSheet([question], resources)
          });
        }
        downloadBlob(createZip(archiveEntries), `${compiled.length}-questions.zip`);
      }
      // Les avertissements ne bloquent pas la compilation ; ils restent affichés pour être lus.
      const warnings = compiled.flatMap(({ fields, path }) => templateWarnings(fields).map(text => `${path} : ${text}`));
      if (warnings.length) {
        showMessage(messages, `L’export a été téléchargé. Avertissement : ${warnings.join(" ")}`, "warning");
      } else {
        showMessage(messages, "L’export a été téléchargé.", "success", 3000);
      }
    } catch (error) {
      showMessage(messages, error.message, "error");
    } finally {
      updateCompilationControls();
    }
  }

  if (!filePicker) {
    return;
  }

  // Ouverte depuis le disque, la page ne peut pas lire les fichiers du projet (le navigateur refuse
  // fetch en file://) : elle l’explique au lieu d’échouer à la première compilation.
  if (location.protocol === "file:") {
    chooseFolderButton.disabled = true;
    showMessage(projectStatus, "Ouvert depuis le disque, l’atelier ne peut pas lire ses fichiers : utilisez la version en ligne, ou lancez compiler/run-local.ps1.", "error");
    return;
  }

  // Atelier (SPECIFICATION.md, § 11.10) sous Chrome et Edge : « Éditeur » sur chaque ligne de la liste,
  // « ← » pour revenir. Sous Firefox et Safari, une phrase les remplace.
  if (canEdit) {
    backButton.addEventListener("click", () => setViewMode("list"));
  } else {
    pasteButton.hidden = true;
    showPasteStatus("Pour modifier les questions, ouvrez l’atelier dans Edge ou Chrome.", "muted");
  }
  // Clavier dans la liste : ↑ ↓ changent de question courante ; sur une question, Entrée l’ouvre dans
  // l’éditeur et Espace la coche pour la compilation (le clic, lui, ne fait que montrer l’aperçu).
  questionList.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveInList(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    const question = event.target.classList.contains("question-preview-button") && event.target.closest("li").question;
    if (!question) return;
    if (event.key === "Enter" && canEdit) {
      event.preventDefault();
      openInEditor(question);
    } else if (event.key === " ") {
      event.preventDefault();
      event.target.closest("li").querySelector(".question-selection").click();
    }
  });

  // Ouvrir un autre dossier enregistre d’abord ce qui attend.
  async function closeEditorTabs() {
    await editor.reset?.();
  }
  // Une pause de la frappe pas encore écoulée : le navigateur demande avant de quitter la page.
  addEventListener("beforeunload", event => {
    if (editor.pending().length) event.preventDefault();
  });

  filePicker.addEventListener("change", () => {
    if (!filePicker.files.length) return;
    const name = filePicker.files[0].webkitRelativePath?.split("/")[0] || filePicker.files[0].name;
    try {
      localStorage.setItem(lastFolderNameKey, name);
    } catch {
      // Stockage indisponible : le nom ne sera pas rappelé.
    }
    loadFolder(name, questionFilesOfPicker(filePicker.files), { brand: brandOfPicker(filePicker.files) });
  });
  chooseFolderButton.addEventListener("click", async () => {
    await closeEditorTabs();
    if (!canRememberFolder) {
      filePicker.click();
    } else if (rememberedHandle && !folderHandle) {
      reopenFolder();
    } else {
      pickFolder();
    }
  });
  otherFolderButton.addEventListener("click", async () => {
    await closeEditorTabs();
    pickFolder();
  });
  pasteButton.addEventListener("click", pasteQuestions);
  reloadFolderButton.addEventListener("click", () => openHandle(folderHandle, { keepSelection: true }));
  // Préchargement de Python dès l’ouverture (SPECIFICATION.md, § 11.1) : Pyodide, SymPy et pywims
  // sont chargés et importés pendant que l’utilisateur choisit son dossier. La session sert
  // seulement à déclencher le chargement ; le Worker et ses paquets restent pour la suite.
  readProjectResources(pythonResources)
    .then(installPythonSources)
    .then(async () => {
      const warmUp = PyWimsPython.createSession("prechargement");
      await warmUp.initialize("import pywims\nfrom sympy import *");
      await warmUp.dispose();
    })
    .catch(() => {
      // Échec silencieux : la compilation recommence le chargement et en donne l’erreur.
    });

  if (canRememberFolder) {
    rememberedFolder().then(handle => {
      rememberedHandle = handle ?? null;
      if (!folderHandle) updateFolderControls();
    });
  } else {
    updateFolderControls();
  }
  search.addEventListener("input", renderQuestionList);
  selectVisibleButton.addEventListener("click", toggleVisibleSelection);
  compileButton.addEventListener("click", downloadQuestion);
  outputMode.addEventListener("change", updateCompilationControls);
  activityTitleInput.addEventListener("input", updateCompilationControls);
  moveUpButton.addEventListener("click", () => moveChosen(-1));
  moveDownButton.addEventListener("click", () => moveChosen(1));
})();
