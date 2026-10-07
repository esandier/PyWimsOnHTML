// Ajoute le champ de saisie MathLive aux widgets partagés par l’exercice.
window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { escapeHtml } = PyWimsTemplate;

  // Dans une iframe (page intégrée à un autre site, bancs de test), MathLive confie par défaut le
  // clavier virtuel à la page parente, qui ne le charge pas : « sandboxed » l’affiche dans le cadre.
  const keyboardPolicy = window.top === window ? "auto" : "sandboxed";

  // Sans cette réservation, MathLive installe dans l’iframe un relais vers la page parente qui
  // échoue avec une page ouverte en file:// (origine « null ») et bloque toute saisie.
  // « sandboxed » remplace ensuite cette propriété par le vrai clavier, monté dans le cadre.
  if (keyboardPolicy === "sandboxed" && !("mathVirtualKeyboard" in window)) {
    Object.defineProperty(window, "mathVirtualKeyboard", { value: undefined, configurable: true, writable: true });
  }

  // Crée un champ MathLive avec clavier virtuel et nom accessible.
  function inputMath(name, options = {}) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Nom invalide pour input_math : ${name}`);
    }

    const idPrefix = PyWimsTemplate.checkIdPrefix(options.idPrefix);
    return `<math-field class="input pw-input pw-math-input" id="${idPrefix}form_txt_${name}" data-name="${name}" math-virtual-keyboard-policy="${keyboardPolicy}" aria-label="${escapeHtml(name)}"></math-field>`;
  }

  // En mode « sandboxed », MathLive n’ouvre pas le clavier tout seul : on l’ouvre au toucher du
  // champ et on le ferme quand le champ perd le focus. Sans objet hors d’une iframe.
  function enableMathKeyboard(root) {
    if (keyboardPolicy !== "sandboxed") {
      return;
    }
    for (const field of root.querySelectorAll("math-field")) {
      field.addEventListener("touchend", () => {
        if (!field.readOnly) {
          window.mathVirtualKeyboard?.show();
        }
      });
      field.addEventListener("focusout", () => window.mathVirtualKeyboard?.hide());
    }
  }

  return Object.freeze({ ...existing, inputMath, enableMathKeyboard });
})();
