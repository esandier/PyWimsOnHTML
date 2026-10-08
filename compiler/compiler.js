// Gère le chargement du projet, l’aperçu sûr des exercices et leur compilation HTML.
(() => {
  // « apres » est facultatif : sans lui, la correction par défaut compare chaque saisie à sa
  // solution (SPECIFICATION.md, § 2.6).
  const requiredFields = ["title", "keywords", "layout", "avant", "enonce"];
  const knownFields = new Set([...requiredFields, "apres"]);
  const chooseFolderButton = document.getElementById("choose-folder");
  const filePicker = document.getElementById("project-folder");
  const folderName = document.getElementById("folder-name");
  const projectStatus = document.getElementById("project-status");
  const search = document.getElementById("exercise-search");
  const exerciseList = document.getElementById("exercise-list");
  const listEmpty = document.getElementById("list-empty");
  const selectionCount = document.getElementById("selection-count");
  const previewFrame = document.getElementById("preview-frame");
  const previewNotice = document.getElementById("preview-notice");
  const compileButton = document.getElementById("compile-exercise");
  const multiOutputControls = document.getElementById("multi-output-controls");
  const outputMode = document.getElementById("output-mode");
  const activityTitleInput = document.getElementById("activity-title");
  const activityTitleLabel = document.getElementById("activity-title-label");
  const messages = document.getElementById("messages");

  let projectFiles = new Map();
  let exercises = [];
  let selectedExercise;
  const selectedExercises = new Set();
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
    element.className = "";
  }

  // Affiche un message ; une durée facultative déclenche ensuite sa disparition en fondu.
  function showMessage(element, text, className = "muted", durationMs = null) {
    const timer = messageTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      messageTimers.delete(element);
    }
    element.className = `${className} transient-message`.trim();
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
          element.className = "";
          messageTimers.delete(element);
        }, messageFadeDurationMs));
      }, durationMs));
    }
  }

  // Analyse les champs délimités par « % » et signale les erreurs avec leur emplacement.
  function parseExerciseSource(source, path = "exercise.pwq") {
    const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    const fields = {};
    let index = 0;

    // Le séparateur ne contient que le signe « % », avec d’éventuels espaces.
    function isDelimiter(line) {
      return line.trim() === "%";
    }

    if (!isDelimiter(lines[index])) {
      throw new Error(`${path} : le fichier doit commencer par une ligne délimiteur « % ».`);
    }
    index += 1;

    while (index < lines.length) {
      const header = lines[index].trim().match(/^%\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!header) {
        throw new Error(`${path}:${index + 1} : en-tête de champ attendu, par exemple « % title ».`);
      }

      const name = header[1];
      if (!knownFields.has(name)) {
        throw new Error(`${path}:${index + 1} : champ inconnu « ${name} ».`);
      }
      if (Object.hasOwn(fields, name)) {
        throw new Error(`${path}:${index + 1} : le champ « ${name} » est présent plusieurs fois.`);
      }
      index += 1;

      if (index >= lines.length || !isDelimiter(lines[index])) {
        throw new Error(`${path}:${index + 1} : ligne délimiteur « % » attendue sous l’en-tête « ${name} ».`);
      }
      index += 1;

      const content = [];
      while (index < lines.length && !isDelimiter(lines[index])) {
        content.push(lines[index]);
        index += 1;
      }
      fields[name] = content.join("\n").trimEnd();

      if (index < lines.length) {
        index += 1;
      }
      if (lines.slice(index).every(line => line.trim() === "")) {
        break;
      }
    }

    for (const required of requiredFields) {
      if (!fields[required]?.trim()) {
        throw new Error(`${path} : le champ obligatoire « ${required} » est absent ou vide.`);
      }
    }
    // Un « apres » vide équivaut à son absence : la question se corrige alors sans Python.
    if (fields.apres !== undefined && !fields.apres.trim()) {
      delete fields.apres;
    }
    return fields;
  }

  // Retire le dossier racine ajouté par le sélecteur pour retrouver le chemin relatif du projet.
  function normalizedProjectPath(file) {
    const path = file.webkitRelativePath || file.name;
    const firstSlash = path.indexOf("/");
    return firstSlash < 0 ? path : path.slice(firstSlash + 1);
  }

  // Aperçu : la vraie page de l’exercice, assemblée comme à la compilation, dans un cadre isolé
  // (sandbox sans « allow-same-origin ») car l’énoncé est du HTML écrit par l’auteur. Le cadre
  // n’exécute jamais Python : il affiche d’abord un tirage provisoire où chaque variable porte son
  // nom, puis un tirage réel calculé par le Python de cette page, chargé une seule fois.
  const previewDrawCache = new Map();
  let previewGeneration = 0;

  // Remplace le Python du cadre : chaque appel reste en attente, donc rien ne se charge ni ne
  // s’affiche en erreur ; les boutons de l’aperçu sont de toute façon inactifs.
  const previewPythonStub = `window.PyWimsPython = { createSession: () => new Proxy({}, { get: () => () => new Promise(() => {}) }) };`;

  // Ajout au <head> de l’aperçu : les boutons y sont inactifs.
  const previewHead = `<style>.pw-actions { pointer-events: none; opacity: 0.45; }</style>`;

  // Tirage provisoire, sans Python : chaque variable de l’énoncé est affichée sous son nom,
  // chaque dimension de matrice nommée vaut 2, et un champ à choix montre deux choix nommés
  // d’après leur liste (« choix[0] », « choix[1] »).
  function previewPlaceholderDraw(fields) {
    const dimensions = {};
    const choices = {};
    const orders = {};
    for (const tag of PyWimsTemplate.parseTags(fields.enonce)) {
      for (const key of ["size", "rows", "cols"]) {
        if (typeof tag.attributes[key] === "string") {
          dimensions[tag.attributes[key]] = 2;
        }
      }
      if (PyWimsTemplate.choiceTypes.has(tag.type)) {
        choices[tag.name] = [0, 1].map(index => `${tag.attributes.choices}[${index}]`);
        orders[tag.name] = [0, 1];
      }
    }
    const context = Object.fromEntries(
      [...PyWimsTemplate.templateVariables(fields.enonce)].map(name => [name, name])
    );
    return { seed: 0, context, dimensions, solutions: {}, choices, orders, explication: null };
  }

  // Ligne d’état au-dessus de l’aperçu (calcul en cours, erreur) ; vide quand l’aperçu est prêt.
  function showPreviewNotice(text, className = "muted") {
    previewNotice.textContent = text;
    previewNotice.className = className;
  }

  // Assemble la page de l’exercice pour un tirage donné et l’affiche dans le cadre.
  async function renderPreviewFrame(fields, draw) {
    const resources = await readProjectResources([fields]);
    resources.python = previewPythonStub;
    previewFrame.srcdoc = assembleExercise(fields, [draw], resources).replace("</head>", `${previewHead}</head>`);
    previewFrame.hidden = false;
  }

  // Affiche l’aperçu provisoire tout de suite, puis le remplace par un tirage réel. Un exercice
  // choisi entre-temps annule la suite (previewGeneration).
  async function showPreview(exercise) {
    previewGeneration += 1;
    const generation = previewGeneration;
    const { fields } = exercise;
    try {
      await renderPreviewFrame(fields, previewPlaceholderDraw(fields));
    } catch (error) {
      previewFrame.hidden = true;
      showPreviewNotice(`Aperçu impossible : ${error.message}`, "error");
      return;
    }
    if (!previewDrawCache.has(exercise)) {
      showPreviewNotice(PyWimsPython.isLoaded?.()
        ? "Aperçu provisoire : les variables apparaissent sous leur nom, le temps de calculer un tirage…"
        : "Aperçu provisoire : les variables apparaissent sous leur nom. Chargement de Python pour calculer un tirage (10 à 20 secondes la première fois)…");
      const draws = computeDraws(fields, { count: 1 });
      previewDrawCache.set(exercise, draws);
      draws.catch(() => previewDrawCache.delete(exercise));
    }
    try {
      const [draw] = await previewDrawCache.get(exercise);
      if (generation !== previewGeneration) {
        return;
      }
      await renderPreviewFrame(fields, draw);
      // Aperçu prêt : le titre du panneau suffit, la ligne d’état disparaît.
      showPreviewNotice("");
    } catch (error) {
      if (generation === previewGeneration) {
        showPreviewNotice(`Le tirage n’a pas pu être calculé : ${error.message}`, "error");
      }
    }
  }

  // Recharge les fichiers du dossier, analyse les exercices et réinitialise l’interface.
  async function onProjectSelected() {
    clearMessage(messages);
    clearMessage(projectStatus);
    projectFiles = new Map();
    exercises = [];
    selectedExercise = undefined;
    selectedExercises.clear();
    outputMode.value = "separate";
    activityTitleInput.value = "";
    exerciseList.replaceChildren();
    listEmpty.hidden = false;
    updateCompilationControls();
    // Un aperçu en cours de calcul ne doit pas s’afficher pour le nouveau dossier.
    previewGeneration += 1;
    previewDrawCache.clear();
    previewFrame.hidden = true;
    previewFrame.removeAttribute("srcdoc");
    showPreviewNotice("Choisissez un exercice dans la liste pour afficher son aperçu.");

    if (!filePicker.files.length) {
      chooseFolderButton.textContent = "Ouvrir un dossier";
      folderName.textContent = "Aucun dossier ouvert";
      listEmpty.textContent = "Ouvrez un dossier pour afficher ses fichiers d’exercice.";
      return;
    }

    // Le bouton annonce le dossier ouvert ; il permet toujours d’en ouvrir un autre.
    const selectedFolder = filePicker.files[0].webkitRelativePath?.split("/")[0];
    chooseFolderButton.textContent = "Dossier ouvert :";
    chooseFolderButton.title = "Ouvrir un autre dossier";
    folderName.textContent = selectedFolder || filePicker.files[0].name;
    showMessage(projectStatus, "Chargement des fichiers d’exercice…");

    for (const file of filePicker.files) {
      projectFiles.set(normalizedProjectPath(file), file);
    }

    // Les tirages se calculent avec le module pywims du dossier, celui qui sera intégré au fichier
    // généré : tirages calculés et rejoués utilisent le même code (SPECIFICATION.md, § 3).
    const moduleFile = projectFiles.get(resourcePaths.pywims);
    if (!moduleFile) {
      showMessage(projectStatus, `Le dossier ne contient pas « ${resourcePaths.pywims} » : ce n’est pas un dossier PyWimsOnHTML.`, "error");
      return;
    }
    await PyWimsPython.setModuleSource(await moduleFile.text());

    const sources = [...projectFiles.entries()]
      .filter(([path]) => path.startsWith("exercises/") && path.toLowerCase().endsWith(".pwq"));

    for (const [path, file] of sources) {
      try {
        const fields = parseExerciseSource(await file.text(), path);
        exercises.push({ path, file, fields });
      } catch (error) {
        exercises.push({ path, file, error });
      }
    }

    const count = exercises.length;
    renderExerciseList();
    showMessage(
      projectStatus,
      `${count} fichier${count === 1 ? "" : "s"} d’exercice chargé${count === 1 ? "" : "s"}.`,
      "success",
      2500
    );
  }

  // Nom d’un exercice dans la liste : son titre, ou le nom du fichier s’il est illisible.
  function exerciseLabel(exercise) {
    return exercise.fields?.title || exercise.file.name;
  }

  // Noms des types de champs de réponse, tels que la liste les affiche.
  const fieldKindNames = {
    input_text: "texte",
    input_math: "formule",
    input_matrix: "matrice",
    input_vmatrix: "matrice redimensionnable",
    input_radio: "choix unique",
    input_checkbox: "choix multiple"
  };

  // Types de champs de réponse d’un énoncé, dans l’ordre et sans répétition : « choix unique ».
  function fieldKindsLabel(enonce) {
    const kinds = [...new Set(PyWimsTemplate.parseTags(enonce).map(tag => fieldKindNames[tag.type] ?? tag.type))];
    return kinds.length ? kinds.join(" · ") : "aucun champ de réponse";
  }

  // Filtre et trie les exercices, puis reconstruit leur liste accessible.
  function renderExerciseList() {
    const query = search.value.trim().toLocaleLowerCase();
    exerciseList.replaceChildren();

    const matches = exercises.filter(exercise => {
      const searchable = `${exercise.fields?.title || ""} ${exercise.fields?.keywords || ""} ${exercise.path}`.toLocaleLowerCase();
      return searchable.includes(query);
    });

    // Ordre naturel des titres : « (2) » avant « (10) » (SPECIFICATION.md, § 11.3).
    matches.sort((left, right) => exerciseLabel(left).localeCompare(exerciseLabel(right), "fr", { numeric: true }));
    for (const exercise of matches) {
      const item = document.createElement("li");
      const selection = document.createElement("input");
      selection.className = "exercise-selection";
      selection.type = "checkbox";
      selection.checked = selectedExercises.has(exercise);
      selection.disabled = Boolean(exercise.error);
      selection.setAttribute(
        "aria-label",
        `Inclure « ${exercise.fields?.title || exercise.file.name} » dans la compilation`
      );
      selection.addEventListener("change", () => {
        if (selection.checked) {
          selectedExercises.add(exercise);
        } else {
          selectedExercises.delete(exercise);
        }
        updateCompilationControls();
      });
      const button = document.createElement("button");
      button.className = "exercise-preview-button";
      button.type = "button";
      button.setAttribute("aria-current", String(exercise === selectedExercise));
      const title = document.createElement("span");
      title.className = "exercise-title";
      title.textContent = exerciseLabel(exercise);
      const kinds = document.createElement("span");
      kinds.className = "exercise-fields";
      kinds.textContent = exercise.error ? "fichier illisible" : fieldKindsLabel(exercise.fields.enonce);
      // Le chemin reste accessible au survol : deux exercices peuvent porter le même titre.
      button.title = exercise.path;
      button.append(title, kinds);
      button.addEventListener("click", () => selectExercise(exercise));
      item.append(selection, button);
      exerciseList.append(item);
    }

    listEmpty.hidden = matches.length > 0;
    if (!exercises.length) {
      listEmpty.textContent = "Aucun fichier .pwq dans le dossier choisi.";
    } else if (!matches.length) {
      listEmpty.textContent = "Aucun fichier ne correspond à cette recherche.";
    }
  }

  // Affiche l’aperçu de l’exercice choisi et met à jour l’état du bouton de compilation.
  function selectExercise(exercise) {
    selectedExercise = exercise;
    renderExerciseList();
    if (exercise.error) {
      previewGeneration += 1;
      previewFrame.hidden = true;
      showPreviewNotice("Impossible de lire cet exercice.", "error");
      clearMessage(messages);
      showMessage(messages, exercise.error.message, "error");
      updateCompilationControls();
      return;
    }

    clearMessage(messages);
    showPreview(exercise);
    updateCompilationControls();
  }

  // Adapte les options de compilation au nombre et au mode des questions choisies.
  function updateCompilationControls() {
    const selected = [...selectedExercises].filter(exercise => !exercise.error);
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
    compileButton.textContent = selected.length > 1
      ? `Compiler (${selected.length})`
      : "Compiler";
  }

  // Protège les données de l’exercice avant de les insérer dans le HTML généré.
  const { escapeHtml } = PyWimsTemplate;

  // Intègre les champs comme texte lisible dans des blocs dédiés au runtime.
  function renderExerciseData(fields) {
    return Object.entries(fields)
      .map(([name, value]) => `<pre data-field="${escapeHtml(name)}">${escapeHtml(value)}</pre>`)
      .join("\n");
  }

  const drawCount = 20;
  let drawSessionCounter = 0;

  // Résume une erreur Python : sa dernière ligne, précédée du numéro de ligne dans « avant ».
  function pythonErrorSummary(message) {
    const lines = String(message).trim().split("\n");
    const lineNumbers = [...String(message).matchAll(/File "<exec>", line (\d+)/g)].map(match => match[1]);
    return lineNumbers.length ? `ligne ${lineNumbers.at(-1)} : ${lines.at(-1)}` : lines.at(-1);
  }

  // Vérifie que chaque solution matricielle a les dimensions du champ qu’elle remplit.
  function matrixShapeErrors(tags, draw) {
    const errors = [];
    for (const tag of tags) {
      const cells = draw.solutions[tag.name];
      if (!Array.isArray(cells) || !["input_matrix", "input_vmatrix"].includes(tag.type)) {
        continue;
      }
      const rows = cells.length;
      const columns = rows ? cells[0].length : 0;
      const ragged = cells.some(row => row.length !== columns);
      const { attributes } = tag;
      if (tag.type === "input_matrix") {
        const dimension = value => (typeof value === "number" ? value : draw.dimensions[value]);
        const expectedRows = dimension(attributes.size ?? attributes.rows);
        const expectedColumns = dimension(attributes.size ?? attributes.cols);
        if (![expectedRows, expectedColumns].every(value => Number.isInteger(value) && value >= 1 && value <= 10)) {
          errors.push(`Les dimensions du champ « ${tag.name} » (${expectedRows} × ${expectedColumns}) doivent être comprises entre 1 et 10.`);
        } else if (ragged || rows !== expectedRows || columns !== expectedColumns) {
          errors.push(`La solution du champ « ${tag.name} » est une matrice ${rows} × ${columns}, alors que le champ est ${expectedRows} × ${expectedColumns}.`);
        }
      } else {
        const maxRows = attributes.max_rows ?? 10;
        const maxColumns = attributes.max_cols ?? 10;
        if (ragged || rows < 1 || columns < 1 || rows > maxRows || columns > maxColumns) {
          errors.push(`La solution du champ « ${tag.name} » est une matrice ${rows} × ${columns}, hors des limites ${maxRows} × ${maxColumns} du champ.`);
        }
      }
    }
    return errors;
  }

  // Contrôle de cohérence d’un tirage (SPECIFICATION.md, § 3) : la solution de chaque champ est
  // saisie comme le ferait un élève, puis « apres » doit la juger juste. Sans ce contrôle, le bouton
  // « Solution » pourrait montrer une réponse que la correction refuse (fraction non simplifiée,
  // indices dans un autre ordre…), ou « apres » planter pour un tirage rare. La session est celle
  // du tirage, où « avant » vient d’être exécuté ; elle est jetée ensuite. Renvoie les messages.
  async function coherenceErrors(session, tags, draw, apres) {
    if (apres === undefined) {
      return defaultCoherenceErrors(tags, draw);
    }
    // Une valeur LIBRE accepte n’importe quelle saisie : « 1 » en tient lieu.
    const typed = value => value ?? "1";
    for (const tag of tags) {
      const { name, type, attributes } = tag;
      const solution = draw.solutions[name];
      if (PyWimsTemplate.choiceTypes.has(type)) {
        await session.setChoice(name, solution);
      } else if (type === "input_text") {
        await session.set(name, typed(solution));
      } else if (type === "input_math") {
        // MathLive transmet une expression en texte (« x^2 + 1 »), et non le LaTeX affiché par la
        // solution : on saisit donc la forme texte, la plus proche de ce que reçoit « apres ».
        await session.set(name, typed(await session.run(`__import__("pywims")._solution_text(${attributes.solution})`)));
      } else {
        await session.setMatrix(name, solution.map(row => row.map(typed)));
      }
    }
    await session.resetAnswers();
    try {
      await session.run(apres);
    } catch (error) {
      return [`« apres » lève une erreur quand on saisit la solution, ${pythonErrorSummary(error.message)}`];
    }
    const errors = [];
    for (const tag of tags) {
      const solution = draw.solutions[tag.name];
      const matrix = ["input_matrix", "input_vmatrix"].includes(tag.type);
      const keys = matrix
        ? solution.flatMap((row, i) => row.map((_, j) => `${tag.name}[${i}][${j}]`))
        : [tag.name];
      const wrong = [];
      for (const key of keys) {
        if (!await session.getBoolean(`bool(ok_answer.get(${JSON.stringify(key)}, False))`)) {
          wrong.push(key);
        }
      }
      if (wrong.length) {
        const cells = matrix ? ` (case${wrong.length > 1 ? "s" : ""} ${wrong.map(key => key.slice(tag.name.length)).join(", ")})` : "";
        errors.push(`la solution du champ « ${tag.name} »${cells} est jugée fausse par « apres ».`);
      }
    }
    // Le retour de l’auteur aide souvent à comprendre pourquoi la solution est refusée.
    if (errors.length && await session.getBoolean("'feedback' in globals()")) {
      errors.push(`Retour obtenu : « ${await session.getTemplateValue("feedback")} ».`);
    }
    return errors;
  }

  // Cohérence sans « apres » : la solution, saisie comme le ferait un élève, doit être acceptée par
  // la correction par défaut (runtime/correction.js). C’est vrai par construction, sauf pour une
  // solution qu’aucun élève ne peut saisir : un texte vide (ou fait d’espaces) laisserait le champ
  // vide, et « Vérifier » resterait inactif. Le contrôle passe aussi par le même code que le
  // navigateur, ce qui vérifie la normalisation sur chaque solution réelle.
  function defaultCoherenceErrors(tags, draw) {
    const { isCorrect, normalizedText } = PyWimsCorrection;
    const errors = [];
    for (const { name, type } of tags) {
      const solution = draw.solutions[name];
      let wrong;
      if (PyWimsTemplate.choiceTypes.has(type)) {
        wrong = isCorrect(type, solution, solution) ? [] : [""];
      } else {
        // Une valeur libre (null) se saisit « 1 », comme dans le contrôle avec « apres ».
        const cells = ["input_matrix", "input_vmatrix"].includes(type)
          ? solution.flatMap((row, i) => row.map((cell, j) => [`[${i}][${j}]`, cell]))
          : [["", solution]];
        wrong = cells
          .filter(([, cell]) => (cell !== null && normalizedText(cell) === "") || !isCorrect(type, cell ?? "1", cell))
          .map(([key]) => key);
      }
      if (wrong.length) {
        const where = wrong[0] ? ` (case${wrong.length > 1 ? "s" : ""} ${wrong.join(", ")})` : "";
        errors.push(`la solution du champ « ${name} »${where} est vide ou n’est pas acceptée par la correction par défaut.`);
      }
    }
    return errors;
  }

  // Vérifie que les derniers choix fixés laissent au moins un choix à mélanger.
  function choiceErrors(tags, draw) {
    const errors = [];
    for (const tag of tags) {
      const texts = draw.choices?.[tag.name];
      const fixedLast = tag.attributes.fixed_last ?? 0;
      if (Array.isArray(texts) && fixedLast >= texts.length) {
        errors.push(`fixed_last=${fixedLast} doit être inférieur au nombre de choix (${texts.length}) du champ « ${tag.name} ».`);
      }
    }
    return errors;
  }

  // Ordre d’affichage des choix d’un tirage : mélange de Fisher-Yates par un générateur déterministe
  // (mulberry32), initialisé par la graine et le nom du champ. Le « random » de l’auteur n’est pas
  // touché, donc le tirage rejoué par le navigateur reste identique ; deux champs d’une même question
  // ne sont pas mélangés de la même façon. Les fixedLast derniers choix restent à la fin, dans l’ordre.
  function choiceOrder(count, fixedLast, seed, name) {
    let state = seed >>> 0;
    for (const character of name) {
      state = Math.imul(state ^ character.codePointAt(0), 0x9e3779b1) >>> 0;
    }
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const order = Array.from({ length: count - fixedLast }, (_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let index = count - fixedLast; index < count; index += 1) {
      order.push(index);
    }
    return order;
  }

  // Exécute « avant » pour plusieurs graines et garde les tirages distincts. Chaque tirage
  // contient les valeurs de l’énoncé, les solutions converties, les choix et leur ordre
  // d’affichage, et l’explication éventuelle.
  // La première erreur de l’auteur interrompt le calcul, avec la graine en cause.
  async function computeDraws(fields, { count = drawCount, onProgress } = {}) {
    const tags = PyWimsTemplate.parseTags(fields.enonce);
    const choiceTags = tags.filter(tag => PyWimsTemplate.choiceTypes.has(tag.type));
    const spec = {
      variables: [...PyWimsTemplate.templateVariables(fields.enonce)],
      dimensions: [...new Set(tags
        .filter(tag => tag.type === "input_matrix")
        .flatMap(tag => ["size", "rows", "cols"].map(key => tag.attributes[key]))
        .filter(value => typeof value === "string"))],
      fields: tags.map(tag => ({
        name: tag.name, type: tag.type, solution: tag.attributes.solution, choices: tag.attributes.choices
      }))
    };
    // Une formule TeX dans une chaîne ordinaire passe sans erreur Python mais s’affiche abîmée :
    // on la refuse avant tout tirage, pour les deux champs Python.
    // Une formule se corrige par une comparaison symbolique, donc par « apres » (SPECIFICATION.md, § 2.6).
    const mathTag = fields.apres === undefined && tags.find(tag => tag.type === "input_math");
    if (mathTag) {
      throw new Error(`Le champ « ${mathTag.name} » (input_math) exige un « apres » : une formule se corrige par comparaison symbolique, par exemple simplify(math_expression(saisie) - solution) == 0.`);
    }
    const stringErrors = [
      ...await PyWimsPython.sourceErrors(fields.avant, "avant"),
      ...(fields.apres === undefined ? [] : await PyWimsPython.sourceErrors(fields.apres, "apres"))
    ];
    if (stringErrors.length) {
      throw new Error(stringErrors.join(" "));
    }
    // Exécute « avant » avec la graine dans une session neuve et renvoie la session et le tirage ;
    // l’appelant libère la session.
    async function runDraw(seed) {
      drawSessionCounter += 1;
      const session = PyWimsPython.createSession(`compilation-${drawSessionCounter}`);
      try {
        // Les paquets à charger sont déduits des imports de tout le code Python de la question.
        await session.initialize(`${fields.avant}\n${fields.apres ?? ""}`);
        try {
          await session.runSeeded(fields.avant, seed);
        } catch (error) {
          throw new Error(`Erreur dans « avant » pour la graine ${seed}, ${pythonErrorSummary(error.message)}`);
        }
        return { session, draw: await session.collectDraw(spec) };
      } catch (error) {
        await session.dispose();
        throw error;
      }
    }

    // Parties du tirage que le navigateur affiche ou utilise, comparées entre les deux exécutions.
    const drawParts = {
      context: "les valeurs de l’énoncé",
      dimensions: "les dimensions des matrices",
      solutions: "les solutions",
      choices: "les choix",
      explication: "l’explication"
    };

    const draws = [];
    const seen = new Set();
    for (let seed = 0; seed < count; seed += 1) {
      const { session, draw } = await runDraw(seed);
      try {
        const errors = [...draw.errors, ...matrixShapeErrors(tags, draw), ...choiceErrors(tags, draw)];
        if (errors.length) {
          throw new Error(`Graine ${seed} : ${errors.join(" ")}`);
        }
        // Seconde exécution de la même graine (SPECIFICATION.md, § 3) : un hasard que la graine ne
        // fixe pas donnerait au navigateur un autre tirage que celui intégré au fichier.
        const twin = await runDraw(seed);
        await twin.session.dispose();
        const differing = Object.keys(drawParts)
          .filter(part => JSON.stringify(draw[part]) !== JSON.stringify(twin.draw[part]));
        if (differing.length) {
          throw new Error(`Graine ${seed} : deux exécutions de « avant » avec la même graine donnent des tirages différents (${differing.map(part => drawParts[part]).join(", ")}). Tirez le hasard uniquement avec le module random (ou numpy.random.seed) : le navigateur ne pourrait pas rejouer ce tirage.`);
        }
        // Les solutions ont la forme attendue : on peut les saisir et vérifier la correction.
        const incoherences = await coherenceErrors(session, tags, draw, fields.apres);
        if (incoherences.length) {
          throw new Error(`Graine ${seed} : ${incoherences.join(" ")}`);
        }
        const orders = Object.fromEntries(choiceTags.map(tag => [
          tag.name,
          choiceOrder(draw.choices[tag.name].length, tag.attributes.fixed_last ?? 0, seed, tag.name)
        ]));
        // L’ordre fait partie du tirage : deux tirages qui ne diffèrent que par lui restent distincts.
        const key = JSON.stringify([draw.context, draw.solutions, draw.choices, orders, draw.explication]);
        if (!seen.has(key)) {
          seen.add(key);
          draws.push({
            seed,
            context: draw.context,
            dimensions: draw.dimensions,
            solutions: draw.solutions,
            choices: draw.choices,
            orders,
            explication: draw.explication
          });
        }
      } finally {
        await session.dispose();
      }
      onProgress?.(seed + 1, count);
    }
    return draws;
  }

  // Intègre les tirages précalculés en JSON, dans un bloc de texte échappé comme les champs.
  function renderDrawData(draws) {
    return `<pre data-draws>${escapeHtml(JSON.stringify(draws))}</pre>`;
  }

  // Fichiers du projet intégrés au HTML généré ; les widgets facultatifs ne sont lus que s’ils servent.
  const resourcePaths = {
    layout: "layouts/standard.html",
    template: "runtime/template.js",
    correction: "runtime/correction.js",
    brandCss: "css/brand.css",
    exerciseCss: "css/exercise.css",
    textWidget: "widgets/input-text.js",
    mathWidget: "widgets/input-math.js",
    matrixWidget: "widgets/input-matrix.js",
    choiceWidget: "widgets/input-choice.js",
    runner: "runtime/runner.js",
    python: "runtime/python.js",
    pywims: "runtime/pywims.py"
  };

  // Indique quels fichiers du projet utilisent une question ou l’ensemble des questions d’une feuille.
  function neededResources(fieldsOrList) {
    const list = Array.isArray(fieldsOrList) ? fieldsOrList : [fieldsOrList];
    const tagTypes = new Set(list.flatMap(fields => [...PyWimsTemplate.tagTypes(fields.enonce)]));
    // Le module pywims ne sert qu’aux questions qui ont un « apres » : elles seules chargent Python.
    const usesPython = list.some(fields => fields.apres !== undefined);
    return Object.keys(resourcePaths).filter(key =>
      (key !== "pywims" || usesPython) &&
      (key !== "mathWidget" || tagTypes.has("input_math")) &&
      (key !== "matrixWidget" || tagTypes.has("input_matrix") || tagTypes.has("input_vmatrix")) &&
      (key !== "choiceWidget" || tagTypes.has("input_radio") || tagTypes.has("input_checkbox"))
    );
  }

  // Section d’une question : ses champs et ses tirages en texte échappé, lus par runner.js.
  function renderQuestionSection(fields, draws, index) {
    if (!Array.isArray(draws) || !draws.length) {
      throw new Error(`Les tirages de « ${fields.title} » doivent être calculés avant l’assemblage.`);
    }
    if (fields.layout !== "STD") {
      throw new Error(`La mise en page « ${fields.layout} » n’est pas prise en charge par ce prototype.`);
    }
    const tagErrors = PyWimsTemplate.validateTemplate(fields.enonce);
    if (tagErrors.length) {
      throw new Error(tagErrors.join(" ; "));
    }
    // Seule une question qui a un « apres » a besoin de Python ; les autres se corrigent par
    // comparaison avec leur solution (SPECIFICATION.md, § 2.6) et ne chargent pas Pyodide.
    const python = fields.apres === undefined ? "false" : "true";
    return `<section class="pw-question" id="q${index + 1}" data-python="${python}">
<div class="pw-question-data" hidden>
${renderExerciseData(fields)}
${renderDrawData(draws)}
</div>
</section>`;
  }

  // Assemble une question seule ; c’est une feuille d’une question avec la mise en page « question seule ».
  function assembleExercise(fields, draws, resources) {
    return assembleSheet({ title: fields.title, kind: "single", questions: [{ fields, draws }] }, resources);
  }

  // Assemble une activité : une feuille de plusieurs questions dans un seul document.
  function assembleActivity(title, questions, resources) {
    if (!title.trim() || questions.length < 2) {
      throw new Error("Une activité exige un titre et au moins deux questions.");
    }
    return assembleSheet({ title, kind: "activity", questions }, resources);
  }

  // Emplacements de la mise en page qui reçoivent du code tel quel, avec la balise qui l’entoure.
  const inlinedPlaceholders = {
    CSS: "style", TEMPLATE: "script", CORRECTION: "script", WIDGETS: "script", MATHLIVE_LOADER: "script",
    PYWIMS: "script", PYTHON_RUNTIME: "script", RUNNER: "script"
  };

  // Refuse un code qui fermerait sa balise : « </script » au milieu d’un script termine la balise
  // pour le navigateur, et la page générée serait cassée sans aucun message. On n’échappe pas en
  // « <\/script » : le module pywims, intégré tel quel dans un bloc non exécuté, serait modifié.
  function checkInlined(name, code) {
    const element = inlinedPlaceholders[name];
    if (element && new RegExp(`</${element}`, "i").test(code)) {
      throw new Error(`Le code intégré en @@${name}@@ contient « </${element} », qui fermerait la balise <${element}> de la page générée : coupez la chaîne, par exemple '</' + '${element}'.`);
    }
    return code;
  }

  // Empreinte d’une activité, pour la mémoire de la progression (SPECIFICATION.md, § 5.3) : hachage
  // cyrb53 (53 bits, rapide, sans dépendance) du titre et du contenu de toutes les questions. Ce
  // n’est pas une protection : il suffit que deux feuilles différentes n’aient pas la même empreinte,
  // et qu’une feuille modifiée en change.
  function sheetFingerprint(title, questions) {
    const text = JSON.stringify([title, questions.map(({ fields, draws }) => [fields, draws])]);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // Assemble le HTML autonome à partir des textes des fichiers du projet, sans accès au disque.
  // Pyodide, MathJax et MathLive sont chargés une seule fois, quel que soit le nombre de questions.
  function assembleSheet({ title, kind, questions }, resources) {
    const sections = questions.map(({ fields, draws }, index) => renderQuestionSection(fields, draws, index));
    const usesMathWidget = neededResources(questions.map(({ fields }) => fields)).includes("mathWidget");
    const replacements = {
      TITLE: escapeHtml(title),
      SHEET_KIND: kind,
      // Seule une activité garde sa progression : une question seule n’a pas d’empreinte.
      SHEET_ID: kind === "activity" ? ` data-sheet-id="${sheetFingerprint(title, questions)}"` : "",
      CSS: `${resources.brandCss}\n${resources.exerciseCss}`,
      TEMPLATE: resources.template,
      CORRECTION: resources.correction,
      WIDGETS: [resources.textWidget, resources.mathWidget, resources.matrixWidget, resources.choiceWidget]
        .filter(Boolean).join("\n"),
      MATHLIVE_LOADER: usesMathWidget
        ? `// Charge le clavier mathématique uniquement pour les exercices qui en ont besoin.
window.pyWimsMathLiveReady = new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = "https://unpkg.com/mathlive@0.111.0";
  script.onload = resolve;
  script.onerror = () => reject(new Error("Échec du chargement de MathLive."));
  document.head.append(script);
});`
        : "window.pyWimsMathLiveReady = Promise.resolve();",
      // Vide si aucune question n’a d’« apres » : Python n’est alors jamais chargé.
      PYWIMS: resources.pywims ?? "",
      PYTHON_RUNTIME: resources.python,
      QUESTIONS: sections.join("\n"),
      RUNNER: resources.runner
    };
    return resources.layout.replace(/@@([A-Z_]+)@@/g, (_match, name) => {
      if (!Object.hasOwn(replacements, name)) {
        throw new Error(`Emplacement réservé inconnu dans la mise en page : ${name}`);
      }
      return checkInlined(name, replacements[name]);
    });
  }

  // Lit dans le dossier du projet choisi les fichiers dont ces questions ont besoin.
  async function readProjectResources(fieldsList) {
    const resources = {};
    for (const key of neededResources(fieldsList)) {
      const file = projectFiles.get(resourcePaths[key]);
      if (!file) {
        throw new Error(`Le dossier du projet ne contient pas « ${resourcePaths[key]} ».`);
      }
      resources[key] = await file.text();
    }
    return resources;
  }

  // Assemble la feuille avec les fichiers du projet : une question seule si le titre est absent,
  // une activité sinon.
  async function compileSheet(questions, activityTitle = null) {
    const resources = await readProjectResources(questions.map(({ fields }) => fields));
    return activityTitle === null
      ? assembleExercise(questions[0].fields, questions[0].draws, resources)
      : assembleActivity(activityTitle, questions, resources);
  }

  // Construit une archive ZIP sans compression pour distribuer plusieurs pages.
  function createZip(entries) {
    const encoder = new TextEncoder();
    const crc32 = bytes => {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const header = (size, writes) => {
      const bytes = new Uint8Array(size);
      const view = new DataView(bytes.buffer);
      for (const [offset, value, width] of writes) {
        if (width === 2) view.setUint16(offset, value, true);
        else view.setUint32(offset, value, true);
      }
      return bytes;
    };
    if (entries.length > 0xffff) {
      throw new Error("L’archive contient trop de fichiers.");
    }

    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const date = new Date();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const content = encoder.encode(entry.content);
      if (name.length > 0xffff || content.length > 0xffffffff) {
        throw new Error(`Le fichier « ${entry.name} » dépasse la taille maximale prise en charge.`);
      }
      const checksum = crc32(content);
      const localHeader = header(30, [
        [0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2],
        [10, dosTime, 2], [12, dosDate, 2], [14, checksum, 4],
        [18, content.length, 4], [22, content.length, 4],
        [26, name.length, 2], [28, 0, 2]
      ]);
      localParts.push(localHeader, name, content);
      const centralHeader = header(46, [
        [0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2],
        [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2],
        [16, checksum, 4], [20, content.length, 4], [24, content.length, 4],
        [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2],
        [36, 0, 4], [42, localOffset, 4]
      ]);
      centralParts.push(centralHeader, name);
      localOffset += localHeader.length + name.length + content.length;
    }
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    if (localOffset > 0xffffffff || centralSize > 0xffffffff) {
      throw new Error("L’archive dépasse la taille maximale prise en charge.");
    }
    const end = header(22, [
      [0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2],
      [8, entries.length, 2], [10, entries.length, 2],
      [12, centralSize, 4], [16, localOffset, 4], [20, 0, 2]
    ]);
    return new Blob([...localParts, ...centralParts, end], {
      type: "application/zip"
    });
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
  async function downloadExercise() {
    const selected = [...selectedExercises].filter(exercise => !exercise.error);
    if (!selected.length) {
      return;
    }

    showMessage(messages, "Compilation de l’exercice…");
    compileButton.disabled = true;
    try {
      const questions = [];
      for (const [index, exercise] of selected.entries()) {
        const label = selected.length > 1 ? `question ${index + 1}/${selected.length}, ` : "";
        showMessage(messages, `Chargement de Python et calcul des tirages (${label}« ${exercise.fields.title} »)…`);
        // Les tirages valident l’exercice en exécutant « avant », puis sont intégrés au fichier.
        const draws = await computeDraws(exercise.fields, {
          onProgress: (done, total) => showMessage(
            messages,
            `Calcul des tirages (${label}« ${exercise.fields.title} ») : ${done}/${total}…`
          )
        }).catch(error => {
          throw new Error(`${exercise.path} : ${error.message}`);
        });
        questions.push({ fields: exercise.fields, draws, path: exercise.path });
      }
      const html = content => new Blob([content], { type: "text/html;charset=utf-8" });
      if (questions.length === 1) {
        downloadBlob(html(await compileSheet(questions)), createExerciseFilename(questions[0].fields.title));
      } else if (outputMode.value === "activity") {
        const title = activityTitleInput.value.trim();
        if (!title) {
          throw new Error("Indiquez un titre pour l’activité.");
        }
        downloadBlob(html(await compileSheet(questions, title)), createExerciseFilename(title));
      } else {
        // Pages séparées : une feuille d’une question par fichier.
        const archiveEntries = [];
        for (const question of questions) {
          archiveEntries.push({
            name: question.path.replace(/^exercises\//, "").replace(/\.pwq$/i, ".html"),
            content: await compileSheet([question])
          });
        }
        downloadBlob(createZip(archiveEntries), `${questions.length}-questions.zip`);
      }
      showMessage(messages, "La compilation a été téléchargée.", "success", 3000);
    } catch (error) {
      showMessage(messages, error.message, "error");
    } finally {
      updateCompilationControls();
    }
  }

  // Crée un nom de fichier sûr en conservant les lettres Unicode, dont les accents français.
  function createExerciseFilename(title) {
    const slug = title
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `${slug || "exercice"}.html`;
  }

  window.PyWimsCompiler = Object.freeze({
    parseExerciseSource,
    fieldKindsLabel,
    previewPlaceholderDraw,
    choiceOrder,
    computeDraws,
    renderDrawData,
    resourcePaths,
    neededResources,
    assembleExercise,
    assembleActivity,
    renderExerciseData,
    createZip,
    createExerciseFilename
  });

  if (!filePicker) {
    return;
  }

  filePicker.addEventListener("change", onProjectSelected);
  chooseFolderButton.addEventListener("click", () => filePicker.click());
  search.addEventListener("input", renderExerciseList);
  compileButton.addEventListener("click", downloadExercise);
  outputMode.addEventListener("change", updateCompilationControls);
  activityTitleInput.addEventListener("input", updateCompilationControls);
})();
