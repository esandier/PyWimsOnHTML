// Outils communs sur les champs d’une question : lire et écrire une saisie, reconnaître un groupe de
// choix et ses cases cochées, figer un champ, l’animer quand il change ; puis le registre des widgets,
// qui s’en sert pour leurs comportements par défaut. Script classique qui publie window.PyWimsFields
// et window.PyWimsWidgets ; il précède les scripts des widgets, qui s’inscrivent au registre.
window.PyWimsFields = (() => {
  const answerToggleDurationMs = 550;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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


  // Un champ à choix est un groupe (fieldset) : il compte comme un seul champ de la question.
  const isChoiceGroup = field => field.matches(".pw-choices");
  const choiceInputs = group => [...group.querySelectorAll("input")];
  const choiceIndex = element => Number(element.closest(".pw-choice").dataset.choiceIndex);

  // Indices cochés, dans l’ordre de l’auteur : le mélange de l’affichage est invisible pour « question_check ».
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

  // Réduit le champ, applique le changement (couleur, valeur), puis le réagrandit jusqu’à sa taille.
  // Seules des transformations sont animées : rien ne bouge autour du champ. Écarté (octobre 2026) :
  // un rebond à 108 % de la largeur, qui faisait un instant déborder la page sur téléphone et que
  // l’auteur ne voulait pas.
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
      [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }],
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

  return Object.freeze({
    reduceMotion, fieldValue, setFieldValue, isChoiceGroup, choiceInputs, choiceIndex,
    checkedIndices, isFilled, lock, animateField, animateFields
  });
})();

// Registre des widgets (SPECIFICATION.md, § 2.11). Chaque widgets/<nom>/widget.js s’y inscrit par
// PyWimsWidgets.define(nom, { … }) ; la question et le compilateur ne connaissent un champ que par
// les fonctions de son widget, appelées à des moments fixés. Chaque fonction a un défaut, celui d’un
// champ texte : un widget ne fournit que ce qui diffère. Vocabulaire :
//   field  : { name, type, attributes }, un champ du tirage ;
//   input  : un élément que l’élève remplit et que la question colore (champ, case de matrice,
//            groupe de choix) ; chacun a sa clé dans ok_answer ;
//   answer : la réponse de tout le champ, telle que la lit read et que la reçoit « question_check ».
// Solution écartée : un aiguillage par type dans chaque fichier du moteur (question.js, correction.js,
// draws.js), où un nouveau champ devait être ajouté à six ou neuf endroits que rien ne désignait.
window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { fieldValue, setFieldValue, isFilled, lock, animateFields } = PyWimsFields;
  const registry = new Map();
  const freeValue = "∗";

  const defaults = {
    // HTML du champ ; draw : le tirage affiché ; idPrefix : préfixe des identifiants (« q2- »).
    render() {
      throw new Error("Un widget doit fournir render.");
    },
    // Promesse tenue quand le champ peut être lu et écrit (MathLive chargé).
    ready: () => Promise.resolve(),
    // Mise en route après l’insertion de l’énoncé, une fois par tirage, pour toute la question.
    prepare() {},
    // Mise en page qui dépend des formules composées ou de la largeur : après la composition, à
    // chaque saisie et au redimensionnement.
    layout() {},
    // Éléments à remplir, dans l’ordre de l’énoncé.
    inputs: (prompt, field) => [...prompt.querySelectorAll(`[data-name="${CSS.escape(field.name)}"]`)],
    // Clé d’un élément dans ok_answer.
    key: (input, field) => field.name,
    // Réponse du champ, lue dans ses éléments.
    read: inputs => fieldValue(inputs[0]),
    isFilled: input => isFilled(input),
    // Verdicts de la correction par défaut, sans Python (§ 2.6) : { clé: vrai, faux, ou null s’il n’y en
    // a pas } ; hints : { clé: indication } pour une réponse juste mais mal écrite (§ 2.8).
    // Une solution null est une valeur libre (ANY) : toute réponse non vide convient.
    verdicts(answer, field, draw) {
      const solution = draw.solutions[field.name];
      const verdict = solution === null
        ? typeof answer === "string" && answer.trim() !== ""
        : PyWimsCorrection.sameText(answer, solution, field.attributes.match);
      return { verdicts: { [field.name]: verdict }, hints: {} };
    },
    // Transmet la réponse à « question_check » ; values reçoit les valeurs exactes (input_value).
    sendToPython: (python, field, answer) => python.set(field.name, answer),
    // Réponse d’un élève qui saisit la solution, pour le contrôle de cohérence (§ 3) ; une valeur
    // libre (null) se saisit « 1 ».
    typedAnswer: (field, draw) => draw.solutions[field.name] ?? "1",
    // Une seule réponse attendue (ni case de matrice ni choix multiple) : le retour générique dit
    // « Réponse incorrecte » au singulier.
    single: true,
    // Colore les éléments vérifiés et les fige ; verdictOf : élément → verdict.
    color: (inputs, verdictOf) => animateFields(inputs, input => {
      input.classList.add(verdictOf(input) ? "is-correct" : "is-incorrect");
      lock(input, true);
    }),
    // Rouvre un élément faux, après « Corriger ».
    reopen(input) {
      input.classList.remove("is-incorrect");
      lock(input, false);
    },
    // Solution de chaque élément ; null pour une valeur libre.
    solutionOf: (input, field, draw) => draw.solutions[field.name],
    // Écrit la solution dans chaque élément (bouton « Solution »), y compris dans un élément juste ;
    // prompt : l’énoncé affiché.
    showSolution(inputs, field, draw) {
      return animateFields(inputs, input => {
        const solution = this.solutionOf(input, field, draw);
        input.classList.remove("is-incorrect", "is-correct");
        if (solution === null) {
          setFieldValue(input, this.freeText);
          input.classList.add("is-free");
        } else {
          setFieldValue(input, solution);
          input.classList.add("is-correct");
        }
        lock(input, true);
      });
    },
    // Écriture d’une valeur libre dans le champ.
    freeText: freeValue
  };

  function define(name, widget) {
    registry.set(name, Object.freeze({ ...defaults, ...widget, name }));
  }

  function get(name) {
    if (!registry.has(name)) throw new Error(`Widget inconnu : ${name}`);
    return registry.get(name);
  }

  return Object.freeze({ ...existing, define, get, has: name => registry.has(name), defaults: Object.freeze(defaults) });
})();
