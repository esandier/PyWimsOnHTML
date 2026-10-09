// Une question de la feuille : affiche immédiatement un tirage précalculé, prépare Python en
// arrière-plan et gère son cycle de vie : vérifier, corriger, solution, nouvel énoncé, note.
// Script classique qui publie window.PyWimsQuestion ; sheet.js crée les questions de la feuille.
window.PyWimsQuestion = (() => {
  const {
    reduceMotion, fieldValue, setFieldValue, isChoiceGroup, choiceInputs, choiceIndex, isSingleAnswer,
    checkedIndices, isFilled, lock, animateFields
  } = PyWimsFields;
  const freeValue = "∗";
  // Durée maximale de « question_check » à la vérification (SPECIFICATION.md, § 5.1) : au-delà, le moteur
  // Python est arrêté et relancé, et l’élève est invité à modifier sa réponse.
  const checkTimeoutMs = 15000;
  const checkTimeoutMessage =
    "La correction a pris trop de temps : votre réponse est peut-être trop complexe. Modifiez-la et vérifiez de nouveau.";
  // Nombre de relances du moteur Python ; le Python simulé des tests peut ne pas le fournir.
  const pythonEpoch = () => PyWimsPython.epoch?.() ?? 0;
  // Retour générique, quand « question_check » ne définit pas « feedback » ou n’existe pas. Une question qui
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
  // Une feuille qui ne peut afficher aucune formule n’intègre pas MathJax (SPECIFICATION.md, § 5.1) :
  // window.MathJax n’existe pas, il n’y a rien à composer. S’il existe sans être prêt, c’est que son
  // chargement a échoué, ce que l’élève doit savoir.
  async function typeset(element) {
    if (window.MathJax === undefined) {
      return;
    }
    if (!window.MathJax.startup?.promise || !window.MathJax.typesetPromise) {
      throw new Error("Échec du chargement de MathJax.");
    }
    await window.MathJax.startup.promise;
    window.MathJax.typesetClear([element]);
    await window.MathJax.typesetPromise([element]);
  }

  // Note écrite à la française (« 2,5 ») et arrondie au centième ; « + 0 » évite d’afficher « -0 ».
  const formatScore = value => (Math.round(value * 100) / 100 + 0).toLocaleString("fr-FR");

  // Un bouton absent garde sa place (invisible et inactif) : la barre ne bouge jamais.
  function setButton(button, { absent = false, disabled = false } = {}) {
    button.classList.toggle("is-absent", absent);
    button.disabled = absent || disabled;
    button.tabIndex = absent ? -1 : 0;
  }

  // Une question de la feuille : sa section, ses tirages, sa session Python et son cycle de vie.
  //   open     : saisie ; checked : retour affiché (result « ok » ou « ko ») ;
  //   solution : champs remplis par la solution.
  class Question {
    // onSuccess est appelé à la première vérification entièrement juste de l’élève, onScoreChange
    // à chaque changement de la note d’une question notée.
    constructor(section, index, { onSuccess, onScoreChange } = {}) {
      const dataElement = section.querySelector(".pw-question-data");
      this.definition = Object.fromEntries(
        [...dataElement.querySelectorAll("[data-field]")].map(field => [field.dataset.field, field.textContent])
      );
      this.draws = JSON.parse(dataElement.querySelector("[data-draws]")?.textContent || "[]");
      this.section = section;
      this.index = index;
      // Préfixe des identifiants des champs : deux questions peuvent nommer un champ de la même façon.
      this.idPrefix = `${section.id}-`;
      // Sans « question_check », la question se corrige par comparaison avec sa solution, sans Python
      // (SPECIFICATION.md, § 2.6) : elle ne crée aucune session, donc ne charge jamais Pyodide.
      // Une section sans marque vient d’un fichier compilé avant cette règle : elle garde Python.
      this.usesPython = section.dataset.python !== "false";
      this.python = this.usesPython ? PyWimsPython.createSession(section.id) : null;
      const tags = PyWimsTemplate.parseTags(this.definition.question_statement);
      this.tagTypes = new Set(tags.map(tag => tag.type));
      // Type et attributs de la balise de chaque champ, d’après son nom : la correction par défaut en
      // dépend (match, tolerance, form).
      this.typeOf = new Map(tags.map(tag => [tag.name, tag.type]));
      this.attributesOf = new Map(tags.map(tag => [tag.name, tag.attributes]));
      this.choiceTags = tags.filter(tag => PyWimsTemplate.choiceTypes.has(tag.type));
      this.pythonCode = `${this.definition.question_setup}\n${this.definition.question_check ?? ""}`;

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
      // Une question à un seul tirage (sans aléatoire, choix non mélangés) : le bouton remet la
      // question vierge, sous le nom « Recommencer » (SPECIFICATION.md, § 5.2). Il n’est pas masqué,
      // car c’est le seul moyen de refaire la question après « Solution ».
      if (this.draws.length === 1) {
        this.newDrawButton.setAttribute("aria-label", "Recommencer");
        this.newDrawButton.querySelector(".pw-act-label").textContent = "Recommencer";
      }
      this.titleElement.id = `${section.id}-title`;
      // Le numéro est affiché par la pastille, décorative : le titre le donne aux lecteurs d’écran.
      this.titleElement.innerHTML = `<span class="pw-sr-only">Question ${index + 1} : </span>${PyWimsTemplate.escapeHtml(this.definition.question_title)}`;
      this.badgeElement.textContent = String(index + 1);
      // Une question seule porte déjà son titre dans l’en-tête de la page.
      section.setAttribute("aria-labelledby", singleQuestion ? "question-title" : this.titleElement.id);

      // Réussie : une vérification de l’élève entièrement juste ; elle le reste ensuite.
      this.succeeded = false;
      this.onSuccess = onSuccess;
      // Barème : seul un champ à choix, seul dans sa question, peut en avoir un (contrôlé à la
      // compilation). La note est celle de la dernière vérification du tirage affiché, 0 sinon ;
      // son maximum dépend du tirage (nombre de choix, solution).
      this.scoredTag = this.choiceTags.find(tag => Object.hasOwn(tag.attributes, "scoring")) ?? null;
      this.scoring = this.scoredTag && PyWimsTemplate.parseScoring(this.scoredTag.attributes.scoring);
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

      this.promptElement.addEventListener("input", () => {
        // Une liste déroulante remplie prend la largeur de son choix (SPECIFICATION.md, § 2.9).
        if (this.tagTypes.has("input_select")) PyWimsWidgets.fitSelects(this.promptElement);
        this.updateButtons();
      });
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
    // Renvoie la promesse de l’affichage, résolue même en cas d’erreur (déjà signalée).
    start() {
      try {
        if (!this.draws.length) {
          throw new Error("Cette question ne contient aucun tirage : recompilez-la.");
        }
        const selected = this.draws[Math.floor(Math.random() * this.draws.length)];
        return this.renderDraw(selected).catch(error => this.reportError(error));
      } catch (error) {
        this.reportError(error);
        return Promise.resolve();
      }
    }

    // Premier contact avec une question qui a un « question_check » : prépare la session Python du tirage
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
        // Une valeur numérique se saisit dans un champ texte : virgule, fraction ou « ×10^ » y
        // sont permis, ce que le pavé numérique des téléphones ne permet pas (SPECIFICATION.md, § 2.3).
        case "input_text":
        case "input_value":
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
        case "input_select":
          return PyWimsWidgets.inputSelect(tag.name, {
            texts: draw.choices?.[tag.name],
            order: draw.orders?.[tag.name],
            idPrefix
          });
        case "input_radio":
        case "input_checkbox":
          return PyWimsWidgets.inputChoice(tag.name, {
            multiple: tag.type === "input_checkbox",
            texts: draw.choices?.[tag.name],
            order: draw.orders?.[tag.name],
            columns: attributes.columns,
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
    // html : HTML de l’auteur, déjà composé (explication de la solution, écrite comme l’énoncé) ;
    // sinon le texte du retour de « question_check », qui peut reprendre la saisie de l’élève.
    async showFeedback(text, kind, { html = false } = {}) {
      this.hideFeedback();
      // Quelques balises de mise en forme sont admises (<b>, <i>, <br>…) ; le reste est échappé.
      this.feedbackElement.innerHTML = html ? text : PyWimsTemplate.limitedHtml(text);
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

    // Prépare la session Python d’un tirage : espace vierge, « question_setup » rejoué avec la graine,
    // puis contrôle que les valeurs affichées sont bien celles que Python recalcule.
    preparePython(selected) {
      this.drawGeneration += 1;
      const generation = this.drawGeneration;
      const { python, definition } = this;
      this.pythonSettled = false;
      // Session préparée dans ce Worker : après une relance, elle n’existe plus (pythonVerdicts).
      this.pythonEpoch = pythonEpoch();
      this.pythonReady = this.pythonReady.catch(() => {}).then(async () => {
        if (generation !== this.drawGeneration) {
          return;
        }
        await python.dispose();
        await python.initialize(this.pythonCode);
        await python.runSeeded(definition.question_setup, selected.seed);
        for (const [name, expected] of Object.entries(selected.context)) {
          if (await python.getTemplateValue(name) !== expected) {
            throw new Error(`Le tirage n’a pas pu être reproduit (« ${name} » diffère) : la vérification est indisponible.`);
          }
        }
        // Les textes des choix sont affichés : ils sont contrôlés comme les valeurs de l’énoncé.
        for (const tag of this.choiceTags) {
          const texts = await python.getChoiceTexts(tag.attributes.choices, tag.type === "input_select");
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
            // Une relance du moteur, causée par une autre question, n’est pas une erreur de celle-ci :
            // elle se préparera de nouveau à sa prochaine vérification.
            if (error.name !== "PyWimsRestart") this.reportError(error);
          }
        }
      );
    }

    // Hauteur à garder avant d’afficher un autre tirage (newDraw) : celle de l’énoncé affiché,
    // mesurée maintenant, sans minimum, ou le minimum déjà fixé s’il est plus grand. La carte ne
    // rétrécit donc jamais d’un énoncé à l’autre (SPECIFICATION.md, § 5.4).
    // Solution écartée : mesurer à la fin de chaque affichage. Au premier affichage, la mise en page
    // n’est pas définitive (polices, formules) : l’énoncé raccourcissait ensuite, et le minimum
    // laissait jusqu’à 50 px vides sous les choix sur téléphone.
    keepPromptHeight() {
      const { promptElement } = this;
      const kept = Number.parseFloat(promptElement.style.minHeight) || 0;
      promptElement.style.minHeight = "";
      const height = promptElement.getBoundingClientRect().height;
      promptElement.style.minHeight = `${Math.max(height, kept)}px`;
    }

    // Largeur de la fenêtre changée (rotation du téléphone) : les hauteurs mesurées ne valent plus.
    forgetPromptHeight() {
      this.promptElement.style.minHeight = "";
    }

    // Affiche un tirage tout de suite, à partir des valeurs précalculées.
    async renderDraw(selected) {
      const { promptElement } = this;
      this.draw = selected;
      window.MathJax?.typesetClear?.([promptElement]);
      promptElement.innerHTML = PyWimsTemplate.renderTemplate(
        this.definition.question_statement,
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
      // Les largeurs des choix ne sont connues qu’une fois les formules composées. Le widget de
      // choix n’est intégré qu’à une feuille qui a une question à choix.
      PyWimsWidgets.fitChoiceColumns?.(promptElement);
    }

    // Verdicts de la correction par défaut (SPECIFICATION.md, § 2.6), un par champ de fields() :
    // chaque saisie est comparée à la solution du tirage, sans Python. Renvoie aussi l’indication
    // d’un champ input_value dont la valeur est juste mais pas l’écriture (§ 2.8), ou null.
    defaultVerdicts(inputs) {
      const { isCorrect, valueVerdict, formHint } = PyWimsCorrection;
      let hint = null;
      const answerResults = inputs.map(input => {
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
        const fieldName = matrixName ?? name;
        const type = this.typeOf.get(fieldName);
        // Liste déroulante : l’indice choisi dans l’ordre de l’auteur (« » : aucun choix).
        if (type === "input_select") {
          return isCorrect(type, input.value === "" ? null : Number(input.value), this.draw.solutions[name]);
        }
        const attributes = this.attributesOf.get(fieldName) ?? {};
        const solution = this.solutionFor(input);
        if (type === "input_value" && solution !== null &&
            valueVerdict(fieldValue(input), solution, attributes) === "form") {
          hint ??= formHint(attributes.form);
        }
        return isCorrect(type, fieldValue(input), solution, attributes);
      });
      return { answerResults, hint };
    }

    // Transmet toutes les saisies à Python et exécute « question_check ». Renvoie les verdicts, un par champ de
    // fields(), et le retour de l’auteur (null s’il n’a pas défini « feedback »).
    async pythonVerdicts(inputs) {
      const { python } = this;
      this.activatePython();
      // Le moteur a été relancé depuis la préparation (calcul trop long) : la session de cette
      // question n’existe plus, on la prépare de nouveau.
      if (this.pythonEpoch !== pythonEpoch()) {
        this.preparePython(this.draw);
      }
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
        if (input.matches("select")) {
          await python.setChoice(input.dataset.name, input.value === "" ? null : Number(input.value));
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
      await python.run(this.definition.question_check, { timeoutMs: checkTimeoutMs }).catch(error => {
        throw error.name === "PyWimsTimeout" ? new Error(checkTimeoutMessage) : error;
      });

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

    // Corrige les saisies (avec « question_check » ou par défaut), colore les champs ouverts et affiche le retour.
    async check() {
      this.busy = true;
      this.updateButtons();
      try {
        await this.mathLiveReady();
        const inputs = this.fields();
        const { answerResults, feedback: authorFeedback, hint = null } = this.usesPython
          ? await this.pythonVerdicts(inputs)
          : { ...this.defaultVerdicts(inputs), feedback: null };
        const allCorrect = inputs.length > 0 && answerResults.every(Boolean);
        // La variable « feedback » de « question_check » est facultative : sans elle, un retour générique s’affiche.
        // Une valeur juste mais mal écrite (input_value) le dit : l’élève sait ce qui reste à corriger.
        const singleAnswer = inputs.length === 1 && isSingleAnswer(inputs[0]);
        const generic = allCorrect ? defaultFeedback.correct
          : singleAnswer ? defaultFeedback.incorrectSingle : defaultFeedback.incorrect;
        const feedback = authorFeedback ??
          (hint && !allCorrect ? (singleAnswer ? hint : `${generic} ${hint}`) : generic);
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

    // Vérification d’un groupe de choix : le groupe prend le verdict de « question_check » (réussi ou non),
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
            // Une valeur numérique (input_value) a une solution { text, value } : on écrit son texte.
            const stored = this.solutionFor(input);
            const solution = stored !== null && typeof stored === "object" ? stored.text : stored;
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
        if (this.tagTypes.has("input_select")) PyWimsWidgets.fitSelects(this.promptElement);
        this.setState("solution");
        // L’explication est un modèle, comme l’énoncé : ses {{variable}} prennent les valeurs du tirage.
        const explanation = this.definition.question_solution_explanation;
        if (explanation) {
          const html = PyWimsTemplate.renderTemplate(explanation, this.draw.context, () => "");
          await this.showFeedback(html, "is-explanation", { html: true });
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
        this.keepPromptHeight();
        await this.renderDraw(next);
        if (!reduceMotion) {
          promptElement.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
            { duration: 280, easing: "ease-out" }
          );
        }
      } catch (error) {
        // Sans ce catch, une erreur d’affichage du nouveau tirage serait une promesse rejetée que
        // personne n’attend (le bouton appelle newDraw sans await) : l’élève ne verrait rien.
        this.reportError(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }
  }

  return Object.freeze({ Question, formatScore });
})();
