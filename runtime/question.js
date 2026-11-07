// Une question de la feuille : affiche immédiatement un tirage précalculé, prépare Python en
// arrière-plan et gère son cycle de vie : vérifier, corriger, solution, nouvel énoncé, note.
// Script classique qui publie window.PyWimsQuestion ; sheet.js crée les questions de la feuille.
window.PyWimsQuestion = (() => {
  const { reduceMotion } = PyWimsFields;
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
  // Style compact d’une activité (SPECIFICATION.md, § 5.7) : les boutons n’y ont pas de libellé.
  const compactStyle = document.body.dataset.style === "compact";

  // Compose les formules d’un élément dont le contenu vient d’être remplacé.
  // Une feuille qui ne peut afficher aucune formule n’intègre pas MathJax (SPECIFICATION.md, § 5.1) :
  // window.MathJax n’existe pas, il n’y a rien à composer. S’il existe sans être prêt, c’est que son
  // chargement a échoué, ce que l’élève doit savoir.
  // Les espaces avant la ponctuation deviennent ensuite insécables (frenchSpacing).
  async function typeset(element) {
    if (window.MathJax !== undefined) {
      if (!window.MathJax.startup?.promise || !window.MathJax.typesetPromise) {
        throw new Error("Échec du chargement de MathJax.");
      }
      await window.MathJax.startup.promise;
      window.MathJax.typesetClear([element]);
      await window.MathJax.typesetPromise([element]);
    }
    frenchSpacing(element);
    formulaSpacing(element);
    fitWideFormulas(element);
  }

  // Un peu d’air autour d’une formule en ligne (SPECIFICATION.md, § 5.8), du seul côté où le texte a
  // une espace : rien devant une virgule, après une parenthèse ou dans « $n$-ième ». L’espace de
  // certaines polices est étroite (0,20 em en Source Sans 3, contre 0,33 em dans TeX), et la formule,
  // plus large et plus foncée, paraissait collée au mot voisin.
  // Solution écartée : écrire \, dans chaque formule des .pwq, à ne jamais oublier, et trop large
  // avec une police dont l’espace l’est déjà.
  function formulaSpacing(element) {
    // Caractère du texte voisin de la formule, d’un côté ; vide au bord d’un bloc ou d’un <br>.
    const neighbor = (formula, before) => {
      const sibling = before ? "previousSibling" : "nextSibling";
      let node = formula;
      while (!node[sibling]) {
        node = node.parentElement;
        if (!node || node === element || getComputedStyle(node).display !== "inline") return "";
      }
      node = node[sibling];
      if (node.nodeType === Node.ELEMENT_NODE &&
          (node.localName === "br" || getComputedStyle(node).display !== "inline")) return "";
      const text = node.textContent;
      return before ? text.slice(-1) : text.charAt(0);
    };
    for (const formula of element.querySelectorAll("mjx-container")) {
      if (formula.getAttribute("display") === "true") continue;
      formula.classList.toggle("pw-space-before", /\s/.test(neighbor(formula, true)));
      formula.classList.toggle("pw-space-after", /\s/.test(neighbor(formula, false)));
    }
  }

  // Marque « is-wide » chaque formule plus large que sa zone (énoncé, retour) : elle seule défile en
  // largeur (question.css), au lieu de faire défiler toute la page sur téléphone (« A = […], B = […] »
  // de 454 px pour 360 px). Une formule ne déborde que de plus de 1 px, comme un choix (widget de
  // choix) : un arrondi de sa largeur aux pixels de l’écran n’affiche jamais de barre. Les formules
  // des choix ont leur propre règle. Rappelée au redimensionnement : la place a pu changer.
  // Solution écartée : réduire la formule à la largeur de l’écran, illisible sur téléphone.
  function fitWideFormulas(element) {
    const style = getComputedStyle(element);
    const available = element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    for (const formula of element.querySelectorAll("mjx-container")) {
      if (formula.closest(".pw-choice-text")) continue;
      // La largeur de l’image, et non celle du conteneur, qui défile une fois marqué.
      const image = formula.querySelector("svg");
      formula.classList.toggle("is-wide", !!image && image.getBoundingClientRect().width > available + 1);
    }
  }

  // Espace insécable avant « : ; ! ? » et « », et après « « (SPECIFICATION.md, § 5.8) : une espace
  // ordinaire laisse le navigateur couper la ligne juste avant, et un « : » se retrouve seul en début
  // de ligne. Seul le texte change, une fois les formules composées : une formule (mjx-container) ou
  // du code n’est jamais touché, et une espace dans le TeX n’a pas de sens typographique.
  // Solution écartée : remplacer à la compilation, dans le texte des .pwq, où il faudrait reconnaître
  // les formules et les balises ; les retours calculés par « question_check » y échapperaient.
  const unbreakableSpacing = /(?<=«) | (?=[:;!?»])/g;
  function frenchSpacing(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest("mjx-container, math-field, script, style, pre, code, textarea")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push(node);
    }
    for (const node of nodes) {
      const text = node.data.replace(unbreakableSpacing, "\u00a0");
      if (text !== node.data) {
        node.data = text;
      }
      // Après une formule, l’espace insécable ne suffit pas : Edge et Chrome coupent quand même entre
      // la formule (un bloc, pour la mise en ligne) et l’espace. La formule et sa ponctuation sont
      // donc réunies dans un span insécable (constaté dans un retour : « 3 × 12 + 8 / ; 12 = … »).
      const formula = node.previousSibling;
      if (formula?.localName === "mjx-container" && formula.getAttribute("display") !== "true" &&
          /^\u00a0[:;!?»]/.test(node.data)) {
        if (node.data.length > 2) {
          node.splitText(2);
        }
        const glue = document.createElement("span");
        glue.className = "pw-nowrap";
        formula.before(glue);
        glue.append(formula, node);
      }
    }
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
    // à chaque changement de la note d’une question notée, onFeedback quand un retour s’affiche ou
    // s’efface (la zone de retour commune du style compact, gérée par la feuille).
    // draws : les tirages, lus (et décompressés) par la feuille.
    constructor(section, index, { draws, onSuccess, onScoreChange, onFeedback } = {}) {
      const dataElement = section.querySelector(".pw-question-data");
      this.definition = Object.fromEntries(
        [...dataElement.querySelectorAll("[data-field]")].map(field => [field.dataset.field, field.textContent])
      );
      this.draws = draws;
      this.section = section;
      this.index = index;
      // Préfixe des identifiants des champs : deux questions peuvent nommer un champ de la même façon.
      this.idPrefix = `${section.id}-`;
      // Sans « question_check », la question se corrige par comparaison avec sa solution, sans Python
      // (SPECIFICATION.md, § 2.6) : elle ne crée aucune session, donc ne charge jamais Pyodide.
      // Une section sans marque vient d’un fichier compilé avant cette règle : elle garde Python.
      this.usesPython = section.dataset.python !== "false";
      this.python = this.usesPython ? PyWimsPython.createSession(section.id) : null;
      // Les champs viennent des tirages (SPECIFICATION.md, § 2.11) : les mêmes pour tous, mais leurs
      // attributs peuvent changer d’un tirage à l’autre (renderDraw).
      this.useFields(draws[0]?.fields ?? []);
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
      // Style compact : la note se place dans la barre d’icônes, juste à gauche de « Nouvel énoncé »
      // (SPECIFICATION.md, § 5.7). Dans sa propre case de la grille, sous les icônes, elle flottait à
      // côté des choix. Sa largeur est réservée (question.css) : son apparition ne déplace aucun bouton.
      if (compactStyle) {
        this.newDrawButton.before(this.scoreElement);
      }
      // Une question à un seul tirage (sans aléatoire, choix non mélangés) : le bouton remet la
      // question vierge, sous le nom « Recommencer » (SPECIFICATION.md, § 5.2). Il n’est pas masqué,
      // car c’est le seul moyen de refaire la question après « Correction ».
      if (this.draws.length === 1) {
        this.newDrawButton.setAttribute("aria-label", "Recommencer");
        this.newDrawButton.querySelector(".pw-act-label").textContent = "Recommencer";
      }
      this.titleElement.id = `${section.id}-title`;
      // Le numéro est affiché par la pastille, décorative : le titre le donne aux lecteurs d’écran.
      this.titleElement.innerHTML = `<span class="pw-sr-only">Question ${index + 1} : </span>${PyWimsTemplate.escapeHtml(this.definition.question_title)}`;
      this.badgeElement.textContent = String(index + 1);
      // Le style compact affiche le numéro même après la réussite, quand la pastille montre ✓.
      this.badgeElement.dataset.number = String(index + 1);
      // Une question seule porte déjà son titre dans l’en-tête de la page.
      section.setAttribute("aria-labelledby", singleQuestion ? "question-title" : this.titleElement.id);

      // Réussie : une vérification de l’élève entièrement juste ; elle le reste ensuite.
      this.succeeded = false;
      this.onSuccess = onSuccess;
      // Barème : seul un champ à choix, seul dans sa question, peut en avoir un (contrôlé à la
      // compilation). La note est celle de la dernière vérification du tirage affiché, 0 sinon ;
      // son maximum dépend du tirage (nombre de choix, solution).
      this.scoredTag = this.tags.find(tag => Object.hasOwn(tag.attributes, "scoring")) ?? null;
      this.scoring = this.scoredTag && PyWimsTemplate.parseScoring(this.scoredTag.attributes.scoring);
      this.score = 0;
      this.scoreMax = 0;
      this.onScoreChange = onScoreChange;
      this.onFeedback = onFeedback;
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
        this.layoutWidgets();
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
      this.widgetsReady().then(() => this.updateButtons(), error => this.reportError(error));
    }

    // Affiche un tirage au hasard ; Python attend le premier contact de l’élève (activatePython).
    // L’aperçu du compilateur (data-preview) montre toujours le premier : ses nombres ne changent pas
    // à chaque mise à jour pendant que l’auteur écrit (SPECIFICATION.md, § 3).
    // Renvoie la promesse de l’affichage, résolue même en cas d’erreur (déjà signalée).
    start() {
      try {
        if (!this.draws.length) {
          throw new Error("Cette question ne contient aucun tirage : exportez-la de nouveau.");
        }
        const selected = document.body.dataset.preview === "true"
          ? this.draws[0]
          : this.draws[Math.floor(Math.random() * this.draws.length)];
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

    // Champs du tirage affiché, avec leur type et leurs attributs (SPECIFICATION.md, § 2.11) ; la page
    // ne connaît un champ que par les fonctions de son widget (runtime/fields.js).
    useFields(fields) {
      this.tags = fields;
      this.widgets = [...new Set(fields.map(tag => tag.type))].map(type => PyWimsWidgets.get(type));
    }

    widget(tag) {
      return PyWimsWidgets.get(tag.type);
    }

    // Construit le HTML d’un champ ; choix et ordre viennent du tirage.
    renderWidget(tag, draw) {
      return this.widget(tag).render(tag, { draw, idPrefix: this.idPrefix });
    }

    // Mise en page des champs qui dépend des formules ou de la largeur (colonnes des choix, largeur des
    // listes déroulantes) : après la composition, à chaque saisie et au redimensionnement.
    layoutWidgets() {
      for (const widget of this.widgets) widget.layout(this.promptElement);
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

    // Attend que chaque widget puisse être lu et écrit (MathLive chargé).
    widgetsReady() {
      return Promise.all(this.widgets.map(widget => widget.ready()));
    }

    // Champs du tirage affiché, chacun avec son widget et ses éléments à remplir.
    entries() {
      return this.tags.map(field => {
        const widget = this.widget(field);
        return { field, widget, inputs: widget.inputs(this.promptElement, field) };
      });
    }

    // Éléments encore modifiables : un élément juste reste vert et figé.
    openInputs() {
      return this.entries().flatMap(({ widget, inputs }) =>
        inputs.filter(input => !input.classList.contains("is-correct")).map(input => ({ widget, input })));
    }

    // Seuls la visibilité, l’action et l’activation des boutons changent selon l’état.
    updateButtons() {
      const failed = this.state === "checked" && this.result === "ko";
      const action = this.state === "open" ? "check" : "fix";
      this.checkButton.dataset.action = action;
      this.checkButton.setAttribute("aria-label", action === "check" ? "Vérifier ma réponse" : "Corriger ma réponse");
      setButton(this.checkButton, {
        absent: !(this.state === "open" || failed),
        disabled: this.busy || (this.state === "open" && !this.openInputs().some(({ widget, input }) => widget.isFilled(input)))
      });
      // « Correction » reste offerte après une réponse juste : l’élève voit la réponse attendue et
      // l’explication ; sa réussite, déjà comptée, le reste. Solution écartée : garder ses réponses et
      // ajouter l’explication dessous, une seconde action pour un bouton qui doit rester simple.
      setButton(this.solutionButton, { absent: !(this.state === "open" || this.state === "checked"), disabled: this.busy });
      setButton(this.newDrawButton, { disabled: this.busy });
      // Sans libellé, une infobulle donne le nom de chaque icône, qui peut changer avec l’état.
      if (compactStyle) {
        for (const button of [this.checkButton, this.solutionButton, this.newDrawButton]) {
          button.title = button.getAttribute("aria-label");
        }
      }
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
      this.onFeedback?.(this, false);
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
      this.onFeedback?.(this, true);
    }

    // Sur écran étroit, l’emplacement du retour prend sa hauteur (--fb-h) : la carte s’agrandit en douceur.
    layoutFeedback() {
      const shown = this.feedbackElement.classList.contains("is-visible");
      this.slotElement.style.setProperty("--fb-h", shown ? `${this.feedbackElement.offsetHeight}px` : "0px");
    }

    // Note et maximum que donnerait le barème pour ces indices cochés, sur le tirage affiché.
    scoreFor(checked) {
      const { name } = this.scoredTag;
      const solution = this.draw.solutions[name];
      return PyWimsTemplate.scoreChoice(this.scoring, {
        multiple: !this.widget(this.scoredTag).single,
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
        // Le context contient chaque variable que lit l’énoncé, y compris celles que reçoivent les
        // champs (solution=, choices=) : les choix affichés sont donc contrôlés avec lui.
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
    // L’énoncé est mesuré tel qu’il s’affiche au départ : ses choix sont d’abord décochés (il va être
    // remplacé). Une question à étapes, dont chaque étape apparaît quand la précédente a une réponse
    // (:has), était mesurée déroulée : la tentative suivante gardait la hauteur de toutes les étapes, et
    // les boutons passaient sous la page.
    keepPromptHeight() {
      const { promptElement } = this;
      for (const input of promptElement.querySelectorAll("input:checked")) input.checked = false;
      for (const select of promptElement.querySelectorAll("select")) select.value = "";
      const kept = Number.parseFloat(promptElement.style.minHeight) || 0;
      promptElement.style.minHeight = "";
      const height = promptElement.getBoundingClientRect().height;
      promptElement.style.minHeight = `${Math.max(height, kept)}px`;
    }

    // Largeur de la fenêtre changée (rotation du téléphone) : les hauteurs mesurées ne valent plus.
    forgetPromptHeight() {
      this.promptElement.style.minHeight = "";
    }

    // Question sans note, bien qu’elle ait un barème : question seule, ou activité dont une question au
    // moins n’a pas de barème (SPECIFICATION.md, § 10.5). Appelée par la feuille avant start().
    dropScoring() {
      this.scoring = null;
      this.scoredTag = null;
      delete this.section.dataset.scored;
      this.scoreElement.hidden = true;
    }

    // Redimensionnement : une formule de l’énoncé ou du retour peut avoir cessé de tenir, ou tenir de nouveau.
    fitWideFormulas() {
      fitWideFormulas(this.promptElement);
      fitWideFormulas(this.feedbackElement);
    }

    // Affiche un tirage tout de suite : son énoncé, rendu par Jinja à la compilation, où chaque marque
    // de champ devient le champ.
    async renderDraw(selected) {
      const { promptElement } = this;
      this.draw = selected;
      this.useFields(selected.fields);
      window.MathJax?.typesetClear?.([promptElement]);
      promptElement.innerHTML = PyWimsTemplate.renderStatement(
        selected.statement,
        this.tags,
        tag => this.renderWidget(tag, selected)
      );
      for (const widget of this.widgets) widget.prepare(promptElement);
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
      this.layoutWidgets();
    }

    // Verdicts de la correction par défaut (SPECIFICATION.md, § 2.6), sans Python : chaque widget lit
    // la réponse de son champ et la compare à la solution du tirage. Renvoie, par clé de ok_answer, le
    // verdict (null pour un champ sans correction par défaut, input_math) et l’indication d’une réponse
    // juste mais mal écrite (input_value, § 2.8).
    defaultVerdicts(entries) {
      const verdicts = {};
      const hints = {};
      for (const { field, widget, inputs } of entries) {
        const result = widget.verdicts(widget.read(inputs, field), field, this.draw);
        Object.assign(verdicts, result.verdicts);
        Object.assign(hints, result.hints);
      }
      return { verdicts, hints };
    }

    // Transmet toutes les réponses à Python et exécute « question_check ». ok_answer est pré-rempli par la
    // correction par défaut ; chaque widget transmet sa réponse (sendToPython). Renvoie le verdict de
    // chaque clé, les indications de la correction par défaut et le retour de l’auteur (null s’il n’a
    // pas défini « feedback »).
    async pythonVerdicts(entries) {
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
      const { verdicts: defaults, hints } = this.defaultVerdicts(entries);
      const prefilled = Object.fromEntries(Object.entries(defaults).filter(([, verdict]) => verdict !== null));
      const values = {};
      for (const { field, widget, inputs } of entries) {
        await widget.sendToPython(python, field, widget.read(inputs, field), this.draw, values);
      }
      await python.prepareCheck({ verdicts: prefilled, values });
      await python.run(this.definition.question_check, { timeoutMs: checkTimeoutMs }).catch(error => {
        throw error.name === "PyWimsTimeout" ? new Error(checkTimeoutMessage) : error;
      });
      const verdicts = {};
      for (const key of Object.keys(defaults)) {
        verdicts[key] = await python.getBoolean(`bool(ok_answer.get(${JSON.stringify(key)}, False))`);
      }
      const feedback = await python.getBoolean("'feedback' in globals()")
        ? await python.getTemplateValue("feedback")
        : null;
      return { verdicts, hints, feedback };
    }

    // Corrige les réponses (avec « question_check » ou par défaut), colore les éléments encore ouverts
    // et affiche le retour.
    async check() {
      this.busy = true;
      this.updateButtons();
      try {
        await this.widgetsReady();
        const entries = this.entries();
        const { verdicts, hints, feedback: authorFeedback } = this.usesPython
          ? await this.pythonVerdicts(entries)
          : { ...this.defaultVerdicts(entries), feedback: null };
        const inputs = entries.flatMap(entry => entry.inputs.map(input => ({ ...entry, input })));
        const verdictOf = ({ widget, field, input }) => verdicts[widget.key(input, field)] === true;
        const allCorrect = inputs.length > 0 && inputs.every(verdictOf);
        // La variable « feedback » de « question_check » est facultative : sans elle, un retour générique
        // s’affiche. Une réponse juste mais mal écrite (input_value) le dit, si sa clé est restée fausse
        // (« question_check » peut accepter l’écriture) : l’élève sait ce qui reste à corriger.
        const hint = Object.entries(hints).find(([key]) => verdicts[key] !== true)?.[1] ?? null;
        const singleAnswer = inputs.length === 1 && inputs[0].widget.single;
        const generic = allCorrect ? defaultFeedback.correct
          : singleAnswer ? defaultFeedback.incorrectSingle : defaultFeedback.incorrect;
        const feedback = authorFeedback ??
          (hint && !allCorrect ? (singleAnswer ? hint : `${generic} ${hint}`) : generic);
        this.hideStatus();

        await Promise.all(entries.map(({ field, widget, inputs: own }) => widget.color(
          own.filter(input => !input.classList.contains("is-correct")),
          input => verdictOf({ widget, field, input }), field, this.draw)));
        this.setState("checked", allCorrect ? "ok" : "ko");
        if (allCorrect) {
          this.markSucceeded();
        }
        // Chaque vérification donne une nouvelle note, calculée sur les choix cochés.
        if (this.scoring) {
          const scored = entries.find(entry => entry.field.name === this.scoredTag.name);
          this.setScore(this.scoreFor([].concat(scored.widget.read(scored.inputs, scored.field) ?? [])).score);
        }
        await this.showFeedback(feedback, allCorrect ? "is-correct" : "is-incorrect");
      } catch (error) {
        this.reportError(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }

    // Retour à la saisie sur le même tirage : les éléments justes restent verts et figés.
    correct() {
      for (const { widget, inputs } of this.entries()) {
        for (const input of inputs.filter(input => input.classList.contains("is-incorrect"))) {
          widget.reopen(input);
        }
      }
      this.hideFeedback();
      this.setState("open");
      this.openInputs()[0]?.input.focus();
    }

    // Remplit tous les champs avec la solution, y compris ceux déjà justes : l’élève voit la solution
    // complète, par exemple « ∗ » sur chaque valeur libre.
    async showSolution() {
      this.busy = true;
      this.updateButtons();
      try {
        await this.widgetsReady();
        this.hideFeedback();
        await Promise.all(this.entries().map(({ field, widget, inputs }) =>
          widget.showSolution(inputs, field, this.draw, this.promptElement)));
        this.setState("solution");
        // L’explication est un modèle Jinja, comme l’énoncé, rendu à la compilation pour chaque tirage.
        const explanation = this.draw.explanation;
        if (explanation) {
          const html = PyWimsTemplate.renderStatement(explanation, [], () => "");
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
