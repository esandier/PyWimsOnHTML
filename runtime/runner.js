// Affiche immédiatement un tirage précalculé de chaque question de la feuille, prépare Python en
// arrière-plan et gère le cycle de vie de chaque question : vérifier, corriger, solution, nouvel énoncé.
(() => {
  const answerToggleDurationMs = 550;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const freeValue = "∗";
  // Retour générique, quand « apres » ne définit pas « feedback » ou n’existe pas. Une question qui
  // n’attend qu’une réponse (un champ texte, MathLive ou à choix unique) dit « Réponse incorrecte » :
  // le pluriel n’a de sens qu’avec plusieurs champs, un choix multiple ou une matrice.
  const defaultFeedback = {
    correct: "Bravo, c’est exact !",
    incorrectSingle: "Réponse incorrecte.",
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

  // Saisie d’un champ : texte, ou expression ASCII d’un champ MathLive (« x^2+1 »), plus proche de
  // ce qu’un élève écrirait au clavier que le LaTeX qu’il affiche.
  function fieldValue(input) {
    if (input.matches("math-field")) {
      return typeof input.getValue === "function" ? input.getValue("ascii-math") : "";
    }
    return input.value;
  }

  // Écrit une valeur dans un champ ; un champ MathLive l’interprète comme du LaTeX.
  function setFieldValue(input, value) {
    input.value = value;
  }

  // Note écrite à la française (« 2,5 ») et arrondie au centième ; « + 0 » évite d’afficher « -0 ».
  const formatScore = value => (Math.round(value * 100) / 100 + 0).toLocaleString("fr-FR");

  // Un champ à choix est un groupe (fieldset) : il compte comme un seul champ de la question.
  const isChoiceGroup = field => field.matches(".pw-choices");
  const choiceInputs = group => [...group.querySelectorAll("input")];
  const choiceIndex = element => Number(element.closest(".pw-choice").dataset.choiceIndex);
  // Un champ qui n’attend qu’une réponse : ni case de matrice, ni choix multiple.
  const isSingleAnswer = field => field.dataset.matrixName === undefined &&
    !(isChoiceGroup(field) && field.dataset.multiple === "true");

  // Indices cochés, dans l’ordre de l’auteur : le mélange de l’affichage est invisible pour « apres ».
  function checkedIndices(group) {
    return choiceInputs(group).filter(input => input.checked).map(choiceIndex).sort((a, b) => a - b);
  }

  // Un champ rempli active « Vérifier ». Ne rien cocher est une réponse possible à un choix multiple.
  function isFilled(field) {
    if (isChoiceGroup(field)) {
      return field.dataset.multiple === "true" || choiceInputs(field).some(input => input.checked);
    }
    return fieldValue(field).trim() !== "";
  }

  // Retire des colonnes à un groupe de choix tant qu’un choix déborde de sa colonne.
  //
  // Pourquoi : sur téléphone, columns=2 ou plus donne des colonnes d’environ 130 px. Une formule
  // (« 2x sin x + x² cos x ») ou un long mot n’y tient pas, et aucune solution purement CSS ne
  // convient, car la grille ne connaît pas la largeur du contenu :
  //   - faire défiler le choix masque une partie de la réponse : « 2x sin x » se lit alors comme
  //     un autre choix, ce qui est inacceptable dans un QCM ;
  //   - couper les mots n’importe où (« dérivabl/e ») est illisible, et la césure française
  //     (hyphens: auto) n’est pas appliquée par tous les navigateurs, dont Edge sous Windows ;
  //   - une formule composée par MathJax (SVG) ne se coupe jamais.
  // On mesure donc après composition : un choix déborde si sa largeur de contenu dépasse sa largeur
  // visible (exige « overflow-wrap: normal » dans exercise.css). Des choix courts gardent leurs
  // colonnes, même sur téléphone. On repart du nombre voulu par l’auteur à chaque appel, car la
  // fenêtre a pu s’élargir depuis (rotation du téléphone).
  function fitChoiceColumns(root) {
    for (const group of root.querySelectorAll(".pw-choices")) {
      for (let columns = Number(group.dataset.columns); columns >= 1; columns -= 1) {
        group.style.setProperty("--pw-choice-columns", String(columns));
        const overflowing = [...group.querySelectorAll(".pw-choice-text")]
          .some(text => text.scrollWidth > text.clientWidth + 1);
        if (!overflowing) break;
      }
    }
  }

  // Fige ou rouvre un champ : un groupe de choix par ses cases, un champ MathLive par readOnly,
  // les autres par disabled.
  function lock(input, locked) {
    if (isChoiceGroup(input)) {
      choiceInputs(input).forEach(choice => { choice.disabled = locked; });
    } else if (input.matches("math-field")) {
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
    // onSuccess est appelé à la première vérification entièrement juste de l’élève, onScoreChange
    // à chaque changement de la note d’une question notée.
    constructor(section, index, { onSuccess, onScoreChange } = {}) {
      const dataElement = section.querySelector(".pw-question-data");
      this.exercise = Object.fromEntries(
        [...dataElement.querySelectorAll("[data-field]")].map(field => [field.dataset.field, field.textContent])
      );
      this.draws = JSON.parse(dataElement.querySelector("[data-draws]")?.textContent || "[]");
      this.section = section;
      this.index = index;
      // Préfixe des identifiants des champs : deux questions peuvent nommer un champ de la même façon.
      this.idPrefix = `${section.id}-`;
      // Sans « apres », la question se corrige par comparaison avec sa solution, sans Python
      // (SPECIFICATION.md, § 2.6) : elle ne crée aucune session, donc ne charge jamais Pyodide.
      // Une section sans marque vient d’un fichier compilé avant cette règle : elle garde Python.
      this.usesPython = section.dataset.python !== "false";
      this.python = this.usesPython ? PyWimsPython.createSession(section.id) : null;
      const tags = PyWimsTemplate.parseTags(this.exercise.enonce);
      this.tagTypes = new Set(tags.map(tag => tag.type));
      // Type de la balise de chaque champ, d’après son nom : la correction par défaut en dépend.
      this.typeOf = new Map(tags.map(tag => [tag.name, tag.type]));
      this.choiceTags = tags.filter(tag => PyWimsTemplate.choiceTypes.has(tag.type));
      this.pythonCode = `${this.exercise.avant}\n${this.exercise.apres ?? ""}`;

      section.append(questionTemplate.content.cloneNode(true));
      const element = role => section.querySelector(`[data-role="${role}"]`);
      this.badgeElement = element("badge");
      this.titleElement = element("title");
      this.promptElement = element("prompt");
      this.statusElement = element("status");
      this.slotElement = element("slot");
      this.feedbackElement = element("feedback");
      this.scoreElement = element("score");
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
      // Barème : seul un champ à choix, seul dans sa question, peut en avoir un (contrôlé à la
      // compilation). La note est celle de la dernière vérification du tirage affiché, 0 sinon ;
      // son maximum dépend du tirage (nombre de choix, solution).
      this.scoredTag = this.choiceTags.find(tag => Object.hasOwn(tag.attributes, "bareme")) ?? null;
      this.scoring = this.scoredTag && PyWimsTemplate.parseScoring(this.scoredTag.attributes.bareme);
      this.score = 0;
      this.scoreMax = 0;
      this.onScoreChange = onScoreChange;
      if (this.scoring) {
        section.dataset.scored = "true";
        this.scoreElement.hidden = false;
      }
      this.draw = null;
      this.state = "open";
      this.result = null;
      this.busy = false;
      // Préparation de la session Python du tirage affiché ; chaque nouvel énoncé en enchaîne une autre.
      this.pythonReady = Promise.resolve();
      this.pythonSettled = false;
      this.drawGeneration = 0;
      // Python n’est préparé qu’au premier contact de l’élève avec la question : un toucher, un clic
      // ou un focus dans sa carte (SPECIFICATION.md, § 5.1). Un élève qui ne fait que lire ne
      // télécharge pas Pyodide. « Vérifier » le déclenche aussi, au cas où rien d’autre ne l’a fait.
      this.pythonActivated = false;
      if (this.usesPython) {
        const activate = () => {
          section.removeEventListener("pointerdown", activate);
          section.removeEventListener("focusin", activate);
          this.activatePython();
        };
        section.addEventListener("pointerdown", activate);
        section.addEventListener("focusin", activate);
      }

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

    // Affiche un tirage au hasard ; Python attend le premier contact de l’élève (activatePython).
    start() {
      try {
        if (!this.draws.length) {
          throw new Error("Cette question ne contient aucun tirage : recompilez-la.");
        }
        const selected = this.draws[Math.floor(Math.random() * this.draws.length)];
        this.renderDraw(selected).catch(error => this.reportError(error));
      } catch (error) {
        this.reportError(error);
      }
    }

    // Premier contact avec une question qui a un « apres » : prépare la session Python du tirage
    // affiché. Ensuite, chaque nouvel énoncé prépare la sienne (newDraw).
    activatePython() {
      if (!this.usesPython || this.pythonActivated) {
        return;
      }
      this.pythonActivated = true;
      this.preparePython(this.draw);
    }

    // Construit le widget d’une balise ; dimensions nommées, choix et ordre viennent du tirage.
    renderWidget(tag, draw) {
      const { attributes } = tag;
      const { dimensions } = draw;
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
        case "input_radio":
        case "input_checkbox":
          return PyWimsWidgets.inputChoice(tag.name, {
            multiple: tag.type === "input_checkbox",
            texts: draw.choices?.[tag.name],
            order: draw.orders?.[tag.name],
            columns: attributes.columns ?? 1,
            idPrefix
          });
        default:
          throw new Error(`Balise de modèle non prise en charge : ${tag.type}`);
      }
    }

    // Ligne d’état sous l’énoncé : chargement de Python ou erreur.
    showStatus(message, isError = false) {
      this.statusElement.textContent = message;
      this.statusElement.classList.toggle("is-error", isError);
      this.statusElement.hidden = false;
    }

    // Masque la ligne d’état et efface son message.
    hideStatus() {
      this.statusElement.textContent = "";
      this.statusElement.classList.remove("is-error");
      this.statusElement.hidden = true;
    }

    // Affiche une erreur à l’élève, et son détail dans la console pour l’auteur.
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
        disabled: this.busy || (this.state === "open" && !this.openFields().some(isFilled))
      });
      setButton(this.solutionButton, { absent: !(this.state === "open" || failed), disabled: this.busy });
      setButton(this.newDrawButton, { disabled: this.busy });
    }

    // Change l’état de la question ; le CSS s’appuie sur data-state et data-result de la section.
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

    // Note et maximum que donnerait le barème pour ces indices cochés, sur le tirage affiché.
    scoreFor(checked) {
      const { name, type } = this.scoredTag;
      const solution = this.draw.solutions[name];
      return PyWimsTemplate.scoreChoice(this.scoring, {
        multiple: type === "input_checkbox",
        count: this.draw.choices[name].length,
        checked,
        solution: Array.isArray(solution) ? solution : [solution]
      });
    }

    // Affiche la note d’une vérification avec un léger rebond, ou l’efface (null : la note vaut 0).
    // La feuille met alors à jour sa note indicative.
    setScore(score) {
      this.score = score ?? 0;
      this.scoreElement.textContent = score === null
        ? ""
        : `Note : ${formatScore(score)} / ${formatScore(this.scoreMax)}`;
      if (score !== null && !reduceMotion) {
        this.scoreElement.animate(
          [{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.7 }, { transform: "scale(1)" }],
          { duration: 450, easing: "ease-out" }
        );
      }
      this.onScoreChange?.(this);
    }

    // Première vérification entièrement juste : le numéro devient ✓ avec un rebond, et la feuille est prévenue.
    // restored : réussite retrouvée dans la mémoire de l’activité, à l’ouverture (§ 5.3) ; le numéro
    // devient ✓ sans rebond, et la feuille, qui met à jour sa progression une seule fois pour toutes
    // les réussites retrouvées, n’est pas prévenue.
    markSucceeded({ restored = false } = {}) {
      if (this.succeeded) {
        return;
      }
      this.succeeded = true;
      this.section.dataset.succeeded = "true";
      this.badgeElement.textContent = "✓";
      this.badgeElement.classList.add("is-done");
      if (restored) {
        return;
      }
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
        // Les textes des choix sont affichés : ils sont contrôlés comme les valeurs de l’énoncé.
        for (const tag of this.choiceTags) {
          const texts = await python.getChoiceTexts(tag.attributes.choices);
          if (JSON.stringify(texts) !== JSON.stringify(selected.choices?.[tag.name])) {
            throw new Error(`Le tirage n’a pas pu être reproduit (« ${tag.attributes.choices} » diffère) : la vérification est indisponible.`);
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
        tag => this.renderWidget(tag, selected)
      );
      if (this.tagTypes.has("input_vmatrix")) {
        PyWimsWidgets.enableVariableMatrixResize(promptElement);
      }
      if (this.tagTypes.has("input_math")) {
        PyWimsWidgets.enableMathKeyboard(promptElement);
      }
      this.hideFeedback();
      this.setState("open");
      // Nouveau tirage : la note revient à 0 et son maximum suit le tirage.
      if (this.scoring) {
        this.scoreMax = this.scoreFor([]).max;
        this.setScore(null);
      }
      try {
        await typeset(promptElement);
      } catch (error) {
        this.reportError(error);
      }
      // Les largeurs des choix ne sont connues qu’une fois les formules composées.
      fitChoiceColumns(promptElement);
      const height = promptElement.getBoundingClientRect().height;
      promptElement.style.minHeight = `${Math.max(height, Number.parseFloat(promptElement.style.minHeight) || 0)}px`;
    }

    // Verdicts de la correction par défaut (SPECIFICATION.md, § 2.6), un par champ de fields() :
    // chaque saisie est comparée à la solution du tirage, sans Python.
    defaultVerdicts(inputs) {
      const { isCorrect } = PyWimsCorrection;
      return inputs.map(input => {
        const { name, matrixName, vmatrixName } = input.dataset;
        if (isChoiceGroup(input)) {
          const indices = checkedIndices(input);
          const given = input.dataset.multiple === "true" ? indices : indices[0] ?? null;
          return isCorrect(this.typeOf.get(name), given, this.draw.solutions[name]);
        }
        // Une matrice redimensionnable aux dimensions fausses : toutes ses cases sont fausses. Sans
        // ce contrôle, une case hors de la solution passerait pour une valeur libre (solutionFor).
        if (vmatrixName !== undefined) {
          const viewport = input.closest(".pw-vmatrix-viewport");
          const cells = this.draw.solutions[matrixName];
          if (Number(viewport.dataset.visibleRows) !== cells.length ||
              Number(viewport.dataset.visibleColumns) !== cells[0].length) {
            return false;
          }
        }
        return isCorrect(this.typeOf.get(matrixName ?? name), fieldValue(input), this.solutionFor(input));
      });
    }

    // Transmet toutes les saisies à Python et exécute « apres ». Renvoie les verdicts, un par champ de
    // fields(), et le retour de l’auteur (null s’il n’a pas défini « feedback »).
    async pythonVerdicts(inputs) {
      const { python } = this;
      this.activatePython();
      if (!this.pythonSettled) {
        this.showStatus("Chargement du moteur Python…");
      }
      await this.pythonReady;
      const matrices = new Map();
      for (const input of inputs) {
        const { matrixName, matrixRow, matrixColumn, vmatrixName } = input.dataset;
        if (isChoiceGroup(input)) {
          const indices = checkedIndices(input);
          await python.setChoice(input.dataset.name, input.dataset.multiple === "true" ? indices : indices[0] ?? null);
          continue;
        }
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
      const feedback = await python.getBoolean("'feedback' in globals()")
        ? await python.getTemplateValue("feedback")
        : null;
      return { answerResults, feedback };
    }

    // Corrige les saisies (avec « apres » ou par défaut), colore les champs ouverts et affiche le retour.
    async check() {
      this.busy = true;
      this.updateButtons();
      try {
        await this.mathLiveReady();
        const inputs = this.fields();
        const { answerResults, feedback: authorFeedback } = this.usesPython
          ? await this.pythonVerdicts(inputs)
          : { answerResults: this.defaultVerdicts(inputs), feedback: null };
        const allCorrect = inputs.length > 0 && answerResults.every(Boolean);
        // La variable « feedback » de « apres » est facultative : sans elle, un retour générique s’affiche.
        const singleAnswer = inputs.length === 1 && isSingleAnswer(inputs[0]);
        const feedback = authorFeedback ?? (allCorrect ? defaultFeedback.correct
          : singleAnswer ? defaultFeedback.incorrectSingle : defaultFeedback.incorrect);
        this.hideStatus();

        const verdicts = new Map(inputs.map((input, index) => [input, answerResults[index]]));
        const toColor = inputs.filter(input => !input.classList.contains("is-correct"));
        await Promise.all([
          animateFields(toColor.filter(input => !isChoiceGroup(input)), input => {
            input.classList.add(verdicts.get(input) ? "is-correct" : "is-incorrect");
            lock(input, true);
          }),
          ...toColor.filter(isChoiceGroup).map(group => this.colorChoices(group, verdicts.get(group)))
        ]);
        this.setState("checked", allCorrect ? "ok" : "ko");
        if (allCorrect) {
          this.markSucceeded();
        }
        // Chaque vérification donne une nouvelle note, calculée sur les choix cochés.
        if (this.scoring) {
          const group = inputs.find(input => isChoiceGroup(input) && input.dataset.name === this.scoredTag.name);
          this.setScore(this.scoreFor(checkedIndices(group)).score);
        }
        await this.showFeedback(feedback, allCorrect ? "is-correct" : "is-incorrect");
      } catch (error) {
        this.reportError(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }

    // Indices des bons choix d’un groupe, d’après la solution du tirage.
    choiceSolution(group) {
      const solution = this.draw.solutions[group.dataset.name];
      return new Set(Array.isArray(solution) ? solution : [solution]);
    }

    // Vérification d’un groupe de choix : le groupe prend le verdict de « apres » (réussi ou non),
    // et seuls les choix cochés se colorent, d’après la solution du tirage. Un choix déjà vert
    // (coché juste lors d’une vérification précédente) ne s’anime pas de nouveau.
    colorChoices(group, correct) {
      group.classList.add(correct ? "is-correct" : "is-incorrect");
      lock(group, true);
      const solution = this.choiceSolution(group);
      const labels = choiceInputs(group)
        .filter(input => input.checked)
        .map(input => input.closest(".pw-choice"))
        .filter(label => !label.classList.contains("is-correct"));
      return animateFields(labels, label => {
        label.classList.add(solution.has(choiceIndex(label)) ? "is-correct" : "is-incorrect");
      });
    }

    // Retour à la saisie sur le même tirage : les champs justes restent verts et figés.
    correct() {
      for (const input of this.fields()) {
        if (!input.classList.contains("is-incorrect")) {
          continue;
        }
        input.classList.remove("is-incorrect");
        if (!isChoiceGroup(input)) {
          lock(input, false);
          continue;
        }
        // Choix multiple : un bon choix coché reste vert et figé ; les autres choix, cochés ou non,
        // redeviennent modifiables. Choix unique : tout se rouvre, car choisir une autre réponse
        // décoche forcément la précédente.
        const multiple = input.dataset.multiple === "true";
        for (const choice of choiceInputs(input)) {
          const label = choice.closest(".pw-choice");
          const kept = multiple && label.classList.contains("is-correct");
          label.classList.remove("is-incorrect");
          if (!kept) label.classList.remove("is-correct");
          choice.disabled = kept;
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

    // Solution d’un groupe de choix : les bons choix sont cochés et verts (ils s’animent l’un après
    // l’autre), les autres décochés et neutres ; le groupe est figé.
    showChoiceSolution(group) {
      const solution = this.choiceSolution(group);
      group.classList.remove("is-incorrect");
      group.classList.add("is-correct");
      lock(group, true);
      const labels = [...group.querySelectorAll(".pw-choice")];
      for (const label of labels.filter(label => !solution.has(choiceIndex(label)))) {
        label.classList.remove("is-correct", "is-incorrect");
        label.querySelector("input").checked = false;
      }
      return animateFields(labels.filter(label => solution.has(choiceIndex(label))), label => {
        label.classList.remove("is-incorrect");
        label.classList.add("is-correct");
        label.querySelector("input").checked = true;
      });
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
        const fields = this.fields();
        await Promise.all([
          animateFields(fields.filter(input => !isChoiceGroup(input)), input => {
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
          }),
          ...fields.filter(isChoiceGroup).map(group => this.showChoiceSolution(group))
        ]);
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
      // Avant le premier contact, rien n’est préparé : activatePython préparera le tirage affiché.
      if (this.pythonActivated) {
        this.preparePython(next);
      }
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

  // Met à jour le pourcentage, l’étiquette et la barre de progression de l’activité ; à 100 %,
  // la feuille est fêtée une seule fois.
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

  // Note indicative de l’activité : somme des dernières notes des questions notées, sur la somme de
  // leurs maxima. Elle n’apparaît que si une question au moins a un barème.
  const scoreTotal = document.getElementById("pw-score-total");
  const scoreTotalValue = document.getElementById("pw-score-total-value");
  const scoreTotalLabel = document.getElementById("pw-score-total-label");

  // Affiche dans l’en-tête la note indicative de l’activité.
  function updateScoreTotal(questions) {
    const scored = questions.filter(question => question.scoring);
    if (!scored.length) {
      return;
    }
    const sum = scored.reduce((total, question) => total + question.score, 0);
    const max = scored.reduce((total, question) => total + question.scoreMax, 0);
    scoreTotalValue.textContent = `${formatScore(sum)} / ${formatScore(max)}`;
    scoreTotalLabel.textContent = scored.length === questions.length
      ? "note indicative"
      : `sur ${scored.length} question${scored.length > 1 ? "s" : ""} notée${scored.length > 1 ? "s" : ""}`;
    scoreTotal.title = `Note indicative : ${scoreTotalValue.textContent}, ${scored.length === questions.length
      ? "toutes les questions sont notées" : scoreTotalLabel.textContent}`;
    scoreTotal.hidden = false;
  }

  // Chaque section de la feuille devient une question indépendante ; seule une activité a une
  // progression et une note indicative.
  // Mémoire de la progression d’une activité (SPECIFICATION.md, § 5.3) : les numéros des questions
  // réussies, gardés par le navigateur sous l’empreinte de la feuille. Plusieurs feuilles d’un même
  // site partagent le stockage : l’empreinte les distingue, et une feuille modifiée en change.
  // Le stockage peut être indisponible (navigation privée, réglages) : la feuille marche sans.
  const sheetId = document.body.dataset.sheetId;
  const progressKey = !singleQuestion && sheetId ? `pywims-progression:${sheetId}` : null;

  function loadProgress() {
    if (!progressKey) return [];
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) ?? "null");
      return Array.isArray(saved?.reussies) ? saved.reussies : [];
    } catch {
      return [];
    }
  }

  function saveProgress(questions) {
    if (!progressKey) return;
    try {
      const succeeded = questions.filter(question => question.succeeded).map(question => question.index + 1);
      localStorage.setItem(progressKey, JSON.stringify({ reussies: succeeded }));
    } catch {
      // Sans stockage, la progression est seulement perdue à la fermeture de la page.
    }
  }

  // Bouton ↺ « Réinitialiser la feuille », dans l’en-tête : efface la mémoire, après confirmation, puis recharge
  // la feuille pour repartir de questions vierges.
  document.getElementById("pw-restart")?.addEventListener("click", () => {
    if (!confirm("Effacer vos réussites et recommencer la feuille ?")) return;
    try {
      localStorage.removeItem(progressKey);
    } catch {
      // Rien à effacer si le stockage est indisponible.
    }
    location.reload();
  });

  const questions = [...document.querySelectorAll(".pw-question")].map(
    (section, index) => new Question(section, index, {
      onSuccess: singleQuestion ? null : () => {
        updateProgress(questions);
        saveProgress(questions);
      },
      onScoreChange: singleQuestion ? null : () => updateScoreTotal(questions)
    })
  );
  if (questions.some(question => question.scoring)) {
    document.body.dataset.scored = "true";
  }
  if (!singleQuestion) {
    // Réussites retrouvées : le ✓ revient, tout le reste repart vierge. Une feuille retrouvée
    // terminée ne relance pas les confettis.
    const restored = new Set(loadProgress());
    for (const question of questions) {
      if (restored.has(question.index + 1)) question.markSucceeded({ restored: true });
    }
    celebrated = questions.every(question => question.succeeded);
    updateProgress(questions);
    updateScoreTotal(questions);
  }
  addEventListener("resize", () => questions.forEach(question => {
    fitChoiceColumns(question.promptElement);
    question.layoutFeedback();
  }));
  for (const question of questions) {
    question.start();
  }
})();
