// Interface du compilateur : ouverture du dossier, liste des exercices, aperçu sûr et compilation.
// Le format, les tirages, l’assemblage et l’archive sont dans les autres scripts de ce dossier.
(() => {
  // Fonctions des modules du compilateur (format.js, draws.js, assemble.js, zip.js).
  const { assembleActivity, assembleExercise, computeDraws, createExerciseFilename, createZip, fieldKindsLabel, neededResources, parseExerciseSource, previewPlaceholderDraw, resourcePaths, templateWarnings } = PyWimsCompiler;

  const chooseFolderButton = document.getElementById("choose-folder");
  const filePicker = document.getElementById("project-folder");
  const folderName = document.getElementById("folder-name");
  const projectStatus = document.getElementById("project-status");
  const search = document.getElementById("exercise-search");
  const exerciseList = document.getElementById("exercise-list");
  const listEmpty = document.getElementById("list-empty");
  const selectionCount = document.getElementById("selection-count");
  const selectVisibleButton = document.getElementById("select-visible");
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
  // Exercices que la recherche laisse affichés et qu’on peut cocher : ceux de « Tout sélectionner ».
  let visibleExercises = [];
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
      // Aperçu prêt : la ligne d’état ne garde que les avertissements sur l’écriture de l’énoncé.
      const warnings = templateWarnings(fields);
      showPreviewNotice(warnings.join(" "), warnings.length ? "warning" : "muted");
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

    // Les tirages se calculent avec le module pywims et le script du Worker du dossier, ceux qui
    // seront intégrés au fichier généré : tirages calculés et rejoués utilisent le même code
    // (SPECIFICATION.md, § 3).
    const moduleFile = projectFiles.get(resourcePaths.pywims);
    const workerFile = projectFiles.get(resourcePaths.pythonWorker);
    const missing = [[moduleFile, resourcePaths.pywims], [workerFile, resourcePaths.pythonWorker]]
      .find(([file]) => !file);
    if (missing) {
      showMessage(projectStatus, `Le dossier ne contient pas « ${missing[1]} » : ce n’est pas un dossier PyWimsOnHTML.`, "error");
      return;
    }
    PyWimsPython.setWorkerSource(await workerFile.text());
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
        updateSelectVisibleButton();
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

    visibleExercises = matches.filter(exercise => !exercise.error);
    updateSelectVisibleButton();
    listEmpty.hidden = matches.length > 0;
    if (!exercises.length) {
      listEmpty.textContent = "Aucun fichier .pwq dans le dossier choisi.";
    } else if (!matches.length) {
      listEmpty.textContent = "Aucun fichier ne correspond à cette recherche.";
    }
  }

  // « Tout sélectionner » tant qu’un exercice visible n’est pas coché, « Tout désélectionner » sinon ;
  // absent quand aucun exercice visible ne peut être coché.
  function updateSelectVisibleButton() {
    const allSelected = visibleExercises.every(exercise => selectedExercises.has(exercise));
    selectVisibleButton.hidden = visibleExercises.length === 0;
    selectVisibleButton.textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  }

  // Coche ou décoche d’un coup les exercices visibles ; les exercices masqués par la recherche
  // gardent leur état (SPECIFICATION.md, § 11.3).
  function toggleVisibleSelection() {
    const allSelected = visibleExercises.every(exercise => selectedExercises.has(exercise));
    for (const exercise of visibleExercises) {
      if (allSelected) {
        selectedExercises.delete(exercise);
      } else {
        selectedExercises.add(exercise);
      }
    }
    renderExerciseList();
    updateCompilationControls();
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

  // Lit dans le dossier du projet choisi les fichiers dont ces questions ont besoin.
  async function readProjectResources(fieldsList) {
    const resources = {};
    for (const key of neededResources(fieldsList)) {
      const file = projectFiles.get(resourcePaths[key]);
      if (!file) {
        throw new Error(`Le dossier du projet ne contient pas « ${resourcePaths[key]} ».`);
      }
      // Le navigateur garde les fichiers tels qu’à l’ouverture du dossier : un fichier modifié ou
      // supprimé depuis ne peut plus être lu, avec un message brut (« The requested file could not
      // be read… »). Les tirages, calculés avant, n’en dépendent pas : l’échec n’arrive qu’ici.
      try {
        resources[key] = await file.text();
      } catch {
        throw new Error(`« ${resourcePaths[key]} » a changé depuis l’ouverture du dossier : rouvrez le dossier, puis compilez de nouveau.`);
      }
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
      // Les avertissements ne bloquent pas la compilation ; ils restent affichés pour être lus.
      const warnings = questions.flatMap(({ fields, path }) => templateWarnings(fields).map(text => `${path} : ${text}`));
      if (warnings.length) {
        showMessage(messages, `La compilation a été téléchargée. Avertissement : ${warnings.join(" ")}`, "warning");
      } else {
        showMessage(messages, "La compilation a été téléchargée.", "success", 3000);
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

  filePicker.addEventListener("change", onProjectSelected);
  chooseFolderButton.addEventListener("click", () => filePicker.click());
  search.addEventListener("input", renderExerciseList);
  selectVisibleButton.addEventListener("click", toggleVisibleSelection);
  compileButton.addEventListener("click", downloadExercise);
  outputMode.addEventListener("change", updateCompilationControls);
  activityTitleInput.addEventListener("input", updateCompilationControls);
})();
