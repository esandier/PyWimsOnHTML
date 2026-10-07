// Fournit les champs à choix unique (input_radio) ou multiple (input_checkbox).
window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { escapeHtml } = PyWimsTemplate;

  // Produit un groupe de choix : une ligne entière cliquable par choix, dans l’ordre du tirage.
  // Chaque choix garde son indice dans la liste de l’auteur (value, data-choice-index) : c’est lui
  // que reçoit « apres ». Le préfixe distingue les questions d’une même feuille (« q2-… »).
  function inputChoice(name, { multiple = false, texts, order, columns = 1, idPrefix = "" } = {}) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Nom invalide pour un champ à choix : ${name}`);
    }
    idPrefix = PyWimsTemplate.checkIdPrefix(idPrefix);
    if (!Array.isArray(texts) || texts.length < 2 || !Array.isArray(order) ||
        order.length !== texts.length || [...order].sort((a, b) => a - b).some((index, rank) => index !== rank)) {
      throw new Error(`Choix invalides pour le champ « ${name} »`);
    }
    if (!Number.isInteger(columns) || columns < 1 || columns > 6) {
      throw new Error(`Nombre de colonnes invalide pour le champ « ${name} » : ${columns}`);
    }
    const type = multiple ? "checkbox" : "radio";
    const items = order.map(index => {
      // Le texte est échappé comme une valeur {{variable}}. Ses accolades le sont aussi : le modèle
      // remplace les {{variable}} après les balises, et ne doit pas toucher au texte d’un choix.
      const text = escapeHtml(texts[index]).replaceAll("{", "&#123;").replaceAll("}", "&#125;");
      return `<label class="pw-choice" data-choice-index="${index}"><input type="${type}" name="${idPrefix}${name}" value="${index}" id="${idPrefix}form_choice_${name}_${index}"><span class="pw-choice-text">${text}</span><span class="pw-choice-mark" aria-hidden="true"></span></label>`;
    }).join("");
    const legend = multiple ? "Cochez toutes les bonnes réponses" : "Choisissez une réponse";
    // data-columns garde le nombre de colonnes voulu par l’auteur ; runner.js peut en retirer.
    return `<fieldset class="pw-choices" data-name="${name}" data-multiple="${multiple}" data-columns="${columns}" style="--pw-choice-columns:${columns}"><legend class="pw-sr-only">${legend}</legend>${items}</fieldset>`;
  }

  return Object.freeze({ ...existing, inputChoice });
})();
