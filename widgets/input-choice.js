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
    // data-columns garde le nombre de colonnes voulu par l’auteur ; fitChoiceColumns peut en retirer.
    return `<fieldset class="pw-choices" data-name="${name}" data-multiple="${multiple}" data-columns="${columns}" style="--pw-choice-columns:${columns}"><legend class="pw-sr-only">${legend}</legend>${items}</fieldset>`;
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
  // Appelée par la question après la composition des formules, et au redimensionnement.
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

  return Object.freeze({ ...existing, inputChoice, fitChoiceColumns });
})();
