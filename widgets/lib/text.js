// Fournit le champ texte standard utilisé par les questions compilés.
window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { escapeHtml } = PyWimsTemplate;

  // Produit le champ éditable et son champ fantôme, qui réserve sa largeur pendant les animations.
  // Le préfixe distingue les identifiants des questions d’une même feuille (« q2-… »).
  // inline : aspect fondu dans la phrase (SPECIFICATION.md, § 2.3), porté par l’enveloppe pour
  // s’appliquer aussi au fantôme, qui doit garder les dimensions du champ.
  function inputText(name, options = {}) {
    if (!PyWimsTemplate.isName(name)) {
      throw new Error(`Nom invalide pour input_text : ${name}`);
    }

    const idPrefix = PyWimsTemplate.checkIdPrefix(options.idPrefix);
    const style = options.style ? ` style="${escapeHtml(options.style)}"` : "";
    return `<span class="pw-input-wrapper${options.inline ? " is-inline" : ""}"><input class="input pw-input absolute" type="text" ${PyWimsTemplate.rawInputAttributes} id="${idPrefix}form_txt_${name}" data-name="${name}"${style} aria-label="${escapeHtml(name)}"><input class="input pw-input phantom" type="text" disabled aria-hidden="true" tabindex="-1"${style}></span>`;
  }

  return Object.freeze({ ...existing, inputText });
})();
