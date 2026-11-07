// Formule saisie avec MathLive (SPECIFICATION.md, § 2.3) : pas de correction par défaut, une formule se
// compare par SymPy dans « question_check » (le compilateur l’exige, d’après widget.json). Ce que
// reçoit « question_check » est l’écriture ASCII (« x^2+1 »), plus proche de ce qu’un élève taperait
// que le LaTeX affiché ; la solution s’écrit en LaTeX, « st » pour une valeur libre.
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
    if (!PyWimsTemplate.isName(name)) {
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

{
  // MathLive est chargé à la première demande, par la page qui affiche le champ : le compilateur, qui
  // lit aussi ce fichier, ne le télécharge pas.
  let loading = null;
  PyWimsWidgets.define("input_math", {
    render: ({ name }, { idPrefix }) => PyWimsWidgets.inputMath(name, { idPrefix }),
    ready() {
      loading ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/mathlive@0.111.0";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Échec du chargement de MathLive."));
        document.head.append(script);
      }).then(() => customElements.whenDefined("math-field"));
      return loading;
    },
    prepare: prompt => PyWimsWidgets.enableMathKeyboard(prompt),
    verdicts: (answer, { name }) => ({ verdicts: { [name]: null }, hints: {} }),
    typedAnswer: ({ name }, draw) => draw.inputs?.[name] ?? "1",
    freeText: "\\ast"
  });
}
