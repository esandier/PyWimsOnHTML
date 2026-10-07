// Affiche immédiatement un tirage précalculé de chaque question de la feuille, prépare Python en
// arrière-plan et gère le cycle de vie de chaque question : vérifier, corriger, solution, nouvel énoncé.
(() => {
  const answerToggleDurationMs = 550;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const freeValue = "∗";
  const defaultFeedback = {
    correct: "Bravo, c’est exact !",
    incorrect: "Certaines réponses sont incorrectes."
  };
  const questionTemplate = document.getElementById("pw-question-template");
  const singleQuestion = document.body.dataset.sheet === "single";

  // Compose les formules d’un élément dont le contenu vient d’être remplacé.
  async function typeset(element) {
    if (!window.MathJax?.startup?.promise || !window.MathJax?.typesetPromise) {
      throw new Error("Échec du chargement de MathJax.");
    }
    await window.MathJax.startup.promise;
    window.MathJax.typesetClear([element]);
    await window.MathJax.typesetPromise([element]);
  }

  function fieldValue(input) {
    if (input.matches("math-field")) {
      return typeof input.getValue === "function" ? input.getValue("ascii-math") : "";
    }
    return input.value;
  }

  function setFieldValue(input, value) {
    input.value = value;
  }

  function lock(input, locked) {
    if (input.matches("math-field")) {
      input.readOnly = locked;
    } else {
      input.disabled = locked;
    }
  }

  // Un bouton absent garde sa place (invisible et inactif) : la barre ne bouge jamais.
  function setButton(button, { absent = false, disabled = false } = {}) {
    button.classList.toggle("is-absent", absent);
    button.disabled = absent || disabled;
    button.tabIndex = absent ? -1 : 0;
  }

  // Réduit le champ, applique le changement (couleur, valeur), puis le réagrandit avec un léger
  // rebond. Seules des transformations sont animées : rien ne bouge autour du champ.
  async function animateField(input, change, delay = 0) {
    if (reduceMotion) {
      change();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    const collapse = input.animate(
      [{ transform: "scaleX(1)", opacity: 1 }, { transform: "scaleX(0)", opacity: 0 }],
      { duration: answerToggleDurationMs / 2, easing: "ease-in", fill: "forwards" }
    );
    await collapse.finished;
    change();
    const expand = input.animate(
      [
        { transform: "scaleX(0)", opacity: 0 },
        { transform: "scaleX(1.08)", opacity: 1, offset: 0.7 },
        { transform: "scaleX(1)", opacity: 1 }
      ],
      { duration: answerToggleDurationMs * 0.7, easing: "ease-out", fill: "forwards" }
    );
    await expand.finished;
    collapse.cancel();
    expand.cancel();
  }

  // Les cases d’une matrice s’animent l’une après l’autre.
  function animateFields(inputs, change) {
    return Promise.all(inputs.map((input, index) => animateField(input, () => change(input, index), index * 60)));
  }

  // Une question de la feuille : sa section, ses tirages, sa session Python et son cycle de vie.
  //   open     : saisie ; checked : retour affiché (result « ok » ou « ko ») ;
  //   solution : champs remplis par la solution.
  class Question {
    // onSuccess est appelé à la première vérification entièrement juste de l’élève.
    constructor(section, index, { onSuccess } = {}) {
      const dataElement = section.querySelector(".pw-question-data");
      this.exercise = Object.fromEntries(
        [...dataElement.querySelectorAll("[data-field]")].map(field => [field.dataset.field, field.textContent])
      );
      this.draws = JSON.parse(dataElement.querySelector("[data-draws]")?.textContent || "[]");
      this.section = section;
      this.index = index;
      // Préfixe des identifiants des champs : deux questions peuvent nommer un champ de la même façon.
      this.idPrefix = `${section.id}-`;
      this.python = PyWimsPython.createSession(section.id);
      this.tagTypes = PyWimsTemplate.tagTypes(this.exercise.enonce);
      this.pythonCode = `${this.exercise.avant}\n${this.exercise.apres}`;

      section.append(questionTemplate.content.cloneNode(true));
      const element = role => section.querySelector(`[data-role="${role}"]`);
      this.badgeElement = element("badge");
      this.titleElement = element("title");
      this.promptElement = element("prompt");
      this.statusElement = element("status");
      this.slotElement = element("slot");
      this.feedbackElement = element("feedback");
      this.checkButton = element("check");
      this.solutionButton = element("solution");
      this.newDrawButton = element("new-draw");
      this.titleElement.id = `${section.id}-title`;
      // Le numéro est affiché par la pastille, décorative : le titre le donne aux lecteurs d’écran.
      this.titleElement.innerHTML = `<span class="pw-sr-only">Question ${index + 1} : </span>${PyWimsTemplate.escapeHtml(this.exercise.title)}`;
      this.badgeElement.textContent = String(index + 1);
      // Une question seule porte déjà son titre dans l’en-tête de la page.
      section.setAttribute("aria-labelledby", singleQuestion ? "exercise-title" : this.titleElement.id);

      // Réussie : une vérification de l’élève entièrement juste ; elle le reste ensuite.
      this.succeeded = false;
      this.onSuccess = onSuccess;
      this.draw = null;
      this.state = "open";
      this.result = null;
      this.busy = false;
      // Préparation de la session Python du tirage affiché ; chaque nouvel énoncé en enchaîne une autre.
      this.pythonReady = Promise.resolve();
      this.pythonSettled = false;
      this.drawGeneration = 0;

      this.promptElement.addEventListener("input", () => this.updateButtons());
      // Un bouton absent est inactif ; la garde protège aussi d’un clic déclenché par script.
      this.checkButton.addEventListener("click", () => {
        if (!this.checkButton.classList.contains("is-absent")) {
          (this.state === "open" ? this.check() : this.correct());
        }
      });
      this.solutionButton.addEventListener("click", () => this.showSolution());
      this.newDrawButton.addEventListener("click", () => this.newDraw());
      this.mathLiveReady().then(() => this.updateButtons(), error => this.reportError(error));
    }

    // Affiche un tirage au hasard et lance la préparation de Python.
    start() {
      try {
        if (!this.draws.length) {
          throw new Error("Cette question ne contient aucun tirage : recompilez-la.");
        }
        const selected = this.draws[Math.floor(Math.random() * this.draws.length)];
        this.renderDraw(selected).catch(error => this.reportError(error));
        this.preparePython(selected);
      } catch (error) {
        this.reportError(error);
      }
    }

    // Construit le widget d’une balise ; les dimensions nommées viennent du tirage.
    renderWidget(tag, dimensions) {
      const { attributes } = tag;
      const idPrefix = this.idPrefix;
      const dimension = value => {
        if (typeof value === "number") {
          return value;
        }
        if (!Object.hasOwn(dimensions, value)) {
          throw new Error(`Variable de dimension matricielle inconnue : ${value}`);
        }
        return dimensions[value];
      };

      switch (tag.type) {
        case "input_text":
          return PyWimsWidgets.inputText(tag.name, { style: attributes.style || "", idPrefix });
        case "input_math":
          return PyWimsWidgets.inputMath(tag.name, { idPrefix });
        case "input_matrix":
          return PyWimsWidgets.inputMatrix(
            tag.name,
            dimension(attributes.size ?? attributes.rows),
            dimension(attributes.size ?? attributes.cols),
            { inputStyle: attributes.input_style || "", idPrefix }
          );
        case "input_vmatrix":
          return PyWimsWidgets.inputVMatrix(
            tag.name,
            attributes.max_rows ?? 10,
            attributes.max_cols ?? 10,
            {
              cellWidth: attributes.cell_width,
              cellHeight: attributes.cell_height,
              inputStyle: attributes.input_style || "",
              idPrefix
            }
          );
        default:
          throw new Error(`Balise de modèle non prise en charge : ${tag.type}`);
      }
    }

    showStatus(message, isError = false) {
      this.statusElement.textContent = message;
      this.statusElement.classList.toggle("is-error", isError);
      this.statusElement.hidden = false;
    }

    hideStatus() {
      this.statusElement.textContent = "";
      this.statusElement.classList.remove("is-error");
      this.statusElement.hidden = true;
    }

    reportError(error) {
      this.showStatus(error.message, true);
      console.error(error);
    }

    // Attend MathLive avant de lire ou d’écrire la valeur d’un champ mathématique.
    async mathLiveReady() {
      if (this.tagTypes.has("input_math")) {
        await window.pyWimsMathLiveReady;
        await customElements.whenDefined("math-field");
      }
    }

    // Champs de saisie de l’énoncé ; seules les cases visibles d’une matrice redimensionnable comptent.
    fields() {
      return [...this.promptElement.querySelectorAll("[data-name], [data-matrix-name]")].filter(input => {
        if (input.dataset.vmatrixName === undefined) {
          return true;
        }
        const viewport = input.closest(".pw-vmatrix-viewport");
        return Number(input.dataset.matrixRow) < Number(viewport.dataset.visibleRows) &&
          Number(input.dataset.matrixColumn) < Number(viewport.dataset.visibleColumns);
      });
    }

    // Champs encore modifiables : un champ juste reste vert et figé.
    openFields() {
      return this.fields().filter(input => !input.classList.contains("is-correct"));
    }

    // Seuls la visibilité, l’action et l’activation des boutons changent selon l’état.
    updateButtons() {
      const failed = this.state === "checked" && this.result === "ko";
      const action = this.state === "open" ? "check" : "fix";
      this.checkButton.dataset.action = action;
      this.checkButton.setAttribute("aria-label", action === "check" ? "Vérifier ma réponse" : "Corriger ma réponse");
      setButton(this.checkButton, {
        absent: !(this.state === "open" || failed),
        disabled: this.busy || (this.state === "open" && !this.openFields().some(input => fieldValue(input).trim()))
      });
      setButton(this.solutionButton, { absent: !(this.state === "open" || failed), disabled: this.busy });
      setButton(this.newDrawButton, { disabled: this.busy });
    }

    setState(state, result = null) {
      this.state = state;
      this.result = result;
      this.section.dataset.state = state;
      if (result) {
        this.section.dataset.result = result;
      } else {
        delete this.section.dataset.result;
      }
      this.updateButtons();
    }

    hideFeedback() {
      window.MathJax?.typesetClear?.([this.feedbackElement]);
      this.feedbackElement.classList.remove("is-visible", "is-correct", "is-incorrect", "is-explanation");
      this.feedbackElement.innerHTML = "";
      this.layoutFeedback();
    }

    // Affiche un retour (juste, faux) ou l’explication de la solution, avec l’animation habituelle.
    async showFeedback(text, kind) {
      this.hideFeedback();
      this.feedbackElement.innerHTML = PyWimsTemplate.escapeHtml(text);
      this.feedbackElement.classList.add(kind);
      await typeset(this.feedbackElement);
      this.feedbackElement.classList.add("is-visible");
      this.layoutFeedback();
    }

    // Sur écran étroit, l’emplacement du retour prend sa hauteur (--fb-h) : la carte s’agrandit en douceur.
    layoutFeedback() {
      const shown = this.feedbackElement.classList.contains("is-visible");
      this.slotElement.style.setProperty("--fb-h", shown ? `${this.feedbackElement.offsetHeight}px` : "0px");
    }

    // Première vérification entièrement juste : le numéro devient ✓ avec un rebond, et la feuille est prévenue.
    markSucceeded() {
      if (this.succeeded) {
        return;
      }
      this.succeeded = true;
      this.section.dataset.succeeded = "true";
      this.badgeElement.textContent = "✓";
      this.badgeElement.classList.add("is-done");
      if (!reduceMotion) {
        this.badgeElement.animate(
          [{ transform: "scale(0.3)" }, { transform: "scale(1.3)", offset: 0.6 }, { transform: "scale(1)" }],
          { duration: 500, easing: "ease-out" }
        );
      }
      this.onSuccess?.(this);
    }

    // Prépare la session Python d’un tirage : espace vierge, « avant » rejoué avec la graine,
    // puis contrôle que les valeurs affichées sont bien celles que Python recalcule.
    preparePython(selected) {
      this.drawGeneration += 1;
      const generation = this.drawGeneration;
      const { python, exercise } = this;
      this.pythonSettled = false;
      this.pythonReady = this.pythonReady.catch(() => {}).then(async () => {
        if (generation !== this.drawGeneration) {
          return;
        }
        await python.dispose();
        await python.initialize(this.pythonCode);
        await python.runSeeded(exercise.avant, selected.seed);
        for (const [name, expected] of Object.entries(selected.context)) {
          if (await python.getTemplateValue(name) !== expected) {
            throw new Error(`Le tirage n’a pas pu être reproduit (« ${name} » diffère) : la vérification est indisponible.`);
          }
        }
      });
      this.pythonReady.then(
        () => {
          if (generation === this.drawGeneration) this.pythonSettled = true;
        },
        error => {
          if (generation === this.drawGeneration) {
            this.pythonSettled = true;
            this.reportError(error);
          }
        }
      );
    }

    // Affiche un tirage tout de suite, à partir des valeurs précalculées. L’énoncé garde la hauteur
    // du plus haut tirage déjà affiché : un nouvel énoncé ne fait jamais remonter les boutons.
    async renderDraw(selected) {
      const { promptElement } = this;
      this.draw = selected;
      window.MathJax?.typesetClear?.([promptElement]);
      promptElement.innerHTML = PyWimsTemplate.renderTemplate(
        this.exercise.enonce,
        selected.context,
        tag => this.renderWidget(tag, selected.dimensions)
      );
      if (this.tagTypes.has("input_vmatrix")) {
        PyWimsWidgets.enableVariableMatrixResize(promptElement);
      }
      if (this.tagTypes.has("input_math")) {
        PyWimsWidgets.enableMathKeyboard(promptElement);
      }
      this.hideFeedback();
      this.setState("open");
      try {
        await typeset(promptElement);
      } catch (error) {
        this.reportError(error);
      }
      const height = promptElement.getBoundingClientRect().height;
      promptElement.style.minHeight = `${Math.max(height, Number.parseFloat(promptElement.style.minHeight) || 0)}px`;
    }

    // Transmet toutes les saisies à Python, exécute « apres », colore les champs ouverts et affiche le retour.
    async check() {
      const { python } = this;
      this.busy = true;
      this.updateButtons();
      try {
        if (!this.pythonSettled) {
          this.showStatus("Chargement du moteur Python…");
        }
        await this.pythonReady;
        await this.mathLiveReady();
        const inputs = this.fields();
        const matrices = new Map();
        for (const input of inputs) {
          const { matrixName, matrixRow, matrixColumn, vmatrixName } = input.dataset;
          if (matrixName === undefined) {
            await python.set(input.dataset.name, fieldValue(input));
            continue;
          }
          if (!matrices.has(matrixName)) {
            const viewport = vmatrixName === undefined ? null : input.closest(".pw-vmatrix-viewport");
            matrices.set(matrixName, viewport
              ? Array.from({ length: Number(viewport.dataset.visibleRows) },
                () => Array(Number(viewport.dataset.visibleColumns)).fill(""))
              : []);
          }
          const matrix = matrices.get(matrixName);
          matrix[Number(matrixRow)] ??= [];
          matrix[Number(matrixRow)][Number(matrixColumn)] = input.value;
        }
        for (const [name, matrix] of matrices) {
          await python.setMatrix(name, matrix);
        }
        await python.resetAnswers();
        await python.run(this.exercise.apres);

        const answerResults = await Promise.all(inputs.map(input => {
          const key = input.dataset.matrixName === undefined
            ? input.dataset.name
            : `${input.dataset.matrixName}[${input.dataset.matrixRow}][${input.dataset.matrixColumn}]`;
          return python.getBoolean(`bool(ok_answer.get(${JSON.stringify(key)}, False))`);
        }));
        const allCorrect = inputs.length > 0 && answerResults.every(Boolean);
        // La variable « feedback » de « apres » est facultative : sans elle, un retour générique s’affiche.
        const feedback = await python.getBoolean("'feedback' in globals()")
          ? await python.getTemplateValue("feedback")
          : allCorrect ? defaultFeedback.correct : defaultFeedback.incorrect;
        this.hideStatus();

        const verdicts = new Map(inputs.map((input, index) => [input, answerResults[index]]));
        await animateFields(inputs.filter(input => !input.classList.contains("is-correct")), input => {
          input.classList.add(verdicts.get(input) ? "is-correct" : "is-incorrect");
          lock(input, true);
        });
        this.setState("checked", allCorrect ? "ok" : "ko");
        if (allCorrect) {
          this.markSucceeded();
        }
        await this.showFeedback(feedback, allCorrect ? "is-correct" : "is-incorrect");
      } catch (error) {
        this.reportError(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }

    // Retour à la saisie sur le même tirage : les champs justes restent verts et figés.
    correct() {
      for (const input of this.fields()) {
        if (input.classList.contains("is-incorrect")) {
          input.classList.remove("is-incorrect");
          lock(input, false);
        }
      }
      this.hideFeedback();
      this.setState("open");
      this.openFields()[0]?.focus();
    }

    // Valeur de solution d’un champ ou d’une case ; null désigne une valeur libre.
    solutionFor(input) {
      const { matrixName, matrixRow, matrixColumn } = input.dataset;
      if (matrixName === undefined) {
        return this.draw.solutions[input.dataset.name];
      }
      return this.draw.solutions[matrixName]?.[Number(matrixRow)]?.[Number(matrixColumn)] ?? null;
    }

    // Remplit tous les champs avec la solution, y compris ceux déjà justes : l’élève voit la solution
    // complète, par exemple « ∗ » sur chaque valeur libre.
    async showSolution() {
      this.busy = true;
      this.updateButtons();
      try {
        await this.mathLiveReady();
        this.hideFeedback();
        for (const viewport of this.promptElement.querySelectorAll(".pw-vmatrix-viewport")) {
          const cells = this.draw.solutions[viewport.dataset.vmatrixName];
          if (Array.isArray(cells) && cells.length) {
            PyWimsWidgets.resizeVariableMatrix(viewport, cells.length, cells[0].length);
          }
        }
        await animateFields(this.fields(), input => {
          const solution = this.solutionFor(input);
          input.classList.remove("is-incorrect", "is-correct");
          if (solution === null) {
            setFieldValue(input, input.matches("math-field") ? "\\ast" : freeValue);
            input.classList.add("is-free");
          } else {
            setFieldValue(input, solution);
            input.classList.add("is-correct");
          }
          lock(input, true);
        });
        this.setState("solution");
        if (this.draw.explication) {
          await this.showFeedback(this.draw.explication, "is-explanation");
        }
      } catch (error) {
        this.reportError(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }

    // Remplace l’énoncé par un autre tirage, en fondu et sans recharger la page ; Python suit en arrière-plan.
    async newDraw() {
      const { promptElement } = this;
      const others = this.draws.filter(candidate => candidate !== this.draw);
      const next = others.length ? others[Math.floor(Math.random() * others.length)] : this.draw;
      this.hideStatus();
      this.preparePython(next);
      this.busy = true;
      this.updateButtons();
      try {
        if (!reduceMotion) {
          await promptElement.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).finished;
        }
        await this.renderDraw(next);
        if (!reduceMotion) {
          promptElement.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
            { duration: 280, easing: "ease-out" }
          );
        }
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }
  }

  // Progression de la feuille : part des questions réussies, chaque question ayant le même poids.
  const completionButton = document.getElementById("pw-completion");
  const completionValue = document.getElementById("pw-completion-value");
  const completionLabel = document.getElementById("pw-completion-label");
  const completionTip = document.getElementById("pw-completion-tip");
  const progressFill = document.getElementById("pw-progress-fill");
  let shownPercent = 0;
  let celebrated = false;

  function updateProgress(questions) {
    const done = questions.filter(question => question.succeeded).length;
    const percent = Math.round(done * 100 / questions.length);
    progressFill.style.width = `${percent}%`;
    completionLabel.textContent = `${done} / ${questions.length} réussie${done > 1 ? "s" : ""}`;
    completionButton.setAttribute("aria-label", `${percent} % de réussite : ${completionLabel.textContent}`);
    // Le pourcentage affiché rejoint la nouvelle valeur en ralentissant.
    const start = shownPercent;
    const startTime = performance.now();
    const step = now => {
      const t = reduceMotion ? 1 : Math.min(1, (now - startTime) / 800);
      shownPercent = Math.round(start + (percent - start) * (1 - (1 - t) ** 3));
      completionValue.textContent = `${shownPercent} %`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (percent === 100 && !celebrated) {
      celebrated = true;
      celebrate();
    }
  }

  // Feuille terminée : message bref et, sauf mouvements réduits, confettis aux couleurs de la charte.
  function celebrate() {
    const toast = document.createElement("div");
    toast.className = "pw-toast";
    toast.setAttribute("role", "status");
    toast.textContent = "Feuille terminée — bravo !";
    document.body.append(toast);
    const toastDuration = 2600;
    if (reduceMotion) {
      setTimeout(() => toast.remove(), toastDuration);
      return;
    }
    toast.animate(
      [
        { opacity: 0, transform: "translate(-50%, -10px)" },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.15 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.85 },
        { opacity: 0, transform: "translate(-50%, -10px)" }
      ],
      { duration: toastDuration }
    ).finished.then(() => toast.remove());
    const style = getComputedStyle(document.documentElement);
    const colors = ["--pw-brand-primary", "--pw-brand-navy", "--pw-correct-text", "--pw-brand-tertiary"]
      .map(name => style.getPropertyValue(name).trim());
    for (let i = 0; i < 70; i += 1) {
      const piece = document.createElement("span");
      piece.className = "pw-confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[i % colors.length];
      document.body.append(piece);
      const drift = (Math.random() - 0.5) * 200;
      piece.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${drift}px, 105vh) rotate(${Math.random() * 900}deg)`, opacity: 0.9 }
        ],
        { duration: 1800 + Math.random() * 1600, delay: Math.random() * 400, easing: "cubic-bezier(.2,.6,.4,1)" }
      ).finished.then(() => piece.remove());
    }
  }

  // Aide : le bouton « ? » ouvre la fenêtre ; un clic hors de son contenu la referme.
  const help = document.getElementById("pw-help");
  document.getElementById("pw-help-button").addEventListener("click", () => help.showModal());
  help.addEventListener("click", event => {
    if (event.target === help) help.close();
  });

  // Bulle du pourcentage : le survol et le focus clavier l’affichent (CSS) ; le toucher l’ouvre et la ferme.
  function toggleCompletionTip(open) {
    completionTip.classList.toggle("is-open", open);
    completionButton.setAttribute("aria-expanded", String(open));
  }
  completionButton.addEventListener("click", event => {
    event.stopPropagation();
    toggleCompletionTip(!completionTip.classList.contains("is-open"));
  });
  document.addEventListener("click", () => toggleCompletionTip(false));

  // Chaque section de la feuille devient une question indépendante ; seule une activité a une progression.
  const questions = [...document.querySelectorAll(".pw-question")].map(
    (section, index) => new Question(section, index, {
      onSuccess: singleQuestion ? null : () => updateProgress(questions)
    })
  );
  if (!singleQuestion) {
    updateProgress(questions);
  }
  addEventListener("resize", () => questions.forEach(question => question.layoutFeedback()));
  for (const question of questions) {
    question.start();
  }
})();
