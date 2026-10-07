// Fournit le champ texte standard utilisé par les exercices compilés.
window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { escapeHtml } = PyWimsTemplate;

  // Produit le champ éditable et son champ fantôme, qui réserve sa largeur pendant les animations.
  // Le préfixe distingue les identifiants des questions d’une même feuille (« q2-… »).
  function inputText(name, options = {}) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Nom invalide pour input_text : ${name}`);
    }

    const idPrefix = PyWimsTemplate.checkIdPrefix(options.idPrefix);
    const style = options.style ? ` style="${escapeHtml(options.style)}"` : "";
    return `<span class="pw-input-wrapper"><input class="input pw-input absolute" type="text" autocomplete="off" id="${idPrefix}form_txt_${name}" data-name="${name}"${style} aria-label="${escapeHtml(name)}"><input class="input pw-input phantom" type="text" disabled aria-hidden="true" tabindex="-1"${style}></span>`;
  }

  return Object.freeze({ ...existing, inputText });
})();
