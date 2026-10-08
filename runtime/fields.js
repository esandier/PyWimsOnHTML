// Outils communs sur les champs d’une question : lire et écrire une saisie, reconnaître un groupe de
// choix et ses cases cochées, figer un champ, l’animer quand il change. Utilisés par la classe Question ;
// script classique qui publie window.PyWimsFields.
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

  return Object.freeze({
    reduceMotion, fieldValue, setFieldValue, isChoiceGroup, choiceInputs, choiceIndex, isSingleAnswer,
    checkedIndices, isFilled, lock, animateField, animateFields
  });
})();
