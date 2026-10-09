// Grammaire unique des modèles d’exercice, partagée par le compilateur et l’exercice généré.
window.PyWimsTemplate = (() => {
  const tagPattern = /{%\s*(.*?)\s*%}/gs;
  const variablePattern = /{{\s*([A-Za-z_]\w*)\s*}}/g;

  // Types d’attributs : entier, nom de variable Python, dimension (l’un ou l’autre) ou texte entre guillemets.
  const tagSchemas = {
    input_text: { style: "text", solution: "variable" },
    input_math: { solution: "variable" },
    input_matrix: {
      size: "dimension", rows: "dimension", cols: "dimension",
      input_style: "text", solution: "variable"
    },
    input_vmatrix: {
      max_rows: "integer", max_cols: "integer",
      cell_width: "text", cell_height: "text", input_style: "text",
      solution: "variable"
    },
    input_radio: {
      choices: "variable", solution: "variable",
      columns: "integer", fixed_last: "integer", bareme: "text"
    },
    input_checkbox: {
      choices: "variable", solution: "variable",
      columns: "integer", fixed_last: "integer", bareme: "text"
    }
  };
  // Champs à choix : leurs choix viennent d’une liste de « avant » et peuvent porter un barème.
  const choiceTypes = new Set(["input_radio", "input_checkbox"]);
  // Directives de barème d’AMC prises en charge. « e » est acceptée sans effet, car une saisie
  // incohérente est impossible ici : un barème d’AMC se recopie ainsi tel quel.
  const scoringDirectives = new Set(["b", "m", "d", "p", "P", "mz", "haut", "MAX", "v", "e"]);
  // Directives d’AMC connues mais non prises en charge : le message le dit, au lieu de « inconnue ».
  const unsupportedScoring = /^(formula|auto|SUF|allowempty|(set|setglobal|default|requires)\..+)$/;
  // Un champ porte le nom de la variable Python qui reçoit la saisie : il ne doit pas
  // écraser une variable du contrat d’exercice, un outil pywims ni un mot-clé Python.
  const reservedNames = new Set([
    "ok_answer", "feedback", "explication_solution",
    "py_wims", "is_nombre", "math_expression", "decimal_fr", "LIBRE", "pywims",
    "False", "None", "True", "and", "as", "assert", "async", "await", "break",
    "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
    "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
    "or", "pass", "raise", "return", "try", "while", "with", "yield"
  ]);
  const typeDescriptions = {
    integer: "un entier",
    variable: "un nom de variable",
    dimension: "un entier ou un nom de variable",
    text: "un texte entre guillemets"
  };

  // Attributs d’un champ texte ou d’une case de matrice : le champ reçoit exactement ce que l’élève
  // tape (SPECIFICATION.md, § 2.3). Sans eux, un iPhone met une majuscule au premier caractère
  // (« x+1 » devient « X+1 », jugé faux) et la correction automatique peut remplacer un mot. Le
  // clavier est le clavier texte complet : le pavé décimal de l’iPhone n’a ni signe moins, ni barre
  // de fraction, ni lettre, et n’offre que le séparateur décimal de la langue du téléphone.
  const rawInputAttributes =
    'inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

  // Protège une valeur avant son insertion dans du HTML, y compris dans un attribut.
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Texte d’un retour (feedback) ou d’une explication de la solution : tout est échappé, puis seules
  // quelques balises de mise en forme, sans attribut, sont rétablies (SPECIFICATION.md, § 2.2). Un
  // « x < 3 » s’affiche donc toujours tel quel, et aucune balise ne peut exécuter de script, même si
  // le retour reprend la saisie de l’élève.
  function limitedHtml(text) {
    return escapeHtml(text)
      .replace(/&lt;(\/?)(b|i|strong|em|sup|sub)&gt;/g, "<$1$2>")
      .replace(/&lt;br\s*\/?&gt;/g, "<br>");
  }

  // Préfixe des identifiants d’une question (« q2- ») ; vide pour un champ hors feuille.
  function checkIdPrefix(prefix = "") {
    if (prefix !== "" && !/^[A-Za-z][\w-]*$/.test(prefix)) {
      throw new Error(`Préfixe d’identifiant invalide : ${prefix}`);
    }
    return prefix;
  }

  // Analyse un barème à la manière d’AMC (« b=1,m=-0.5 ») et renvoie ses directives numériques.
  function parseScoring(source) {
    const scoring = {};
    for (const part of String(source).split(",")) {
      const match = part.trim().match(/^([^=\s]+)\s*=\s*(.*)$/);
      if (!match) {
        // Une valeur sans nom est, dans AMC, le barème propre à une réponse.
        throw new Error(`Directive de barème sans nom « ${part.trim()} » : le barème propre à une réponse n’est pas pris en charge`);
      }
      const [, name, value] = match;
      if (unsupportedScoring.test(name)) {
        throw new Error(`La directive de barème « ${name} » d’AMC n’est pas prise en charge`);
      }
      if (!scoringDirectives.has(name)) {
        throw new Error(`Directive de barème inconnue « ${name} »`);
      }
      if (Object.hasOwn(scoring, name)) {
        throw new Error(`Directive de barème « ${name} » répétée`);
      }
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value.trim())) {
        throw new Error(`La directive de barème « ${name} » doit être un nombre, et non « ${value.trim()} »`);
      }
      scoring[name] = Number(value);
    }
    return Object.freeze(scoring);
  }

  // Note d’un champ à choix selon un barème d’AMC (SPECIFICATION.md, § 10.5). Les indices cochés et
  // les indices justes sont dans l’ordre de l’auteur ; count est le nombre de choix. Le maximum est
  // MAX, ou la note de la réponse parfaite (cocher exactement la solution). Renvoie { score, max }.
  function scoreChoice(scoring, { multiple, count, checked, solution }) {
    const good = new Set(solution);
    const b = scoring.b ?? 1;
    const m = scoring.m ?? 0;
    // « haut=n » se réécrit en « d=n−N,p=0 », comme dans AMC.
    const d = scoring.haut === undefined ? scoring.d ?? 0 : scoring.haut - count;
    const floor = scoring.haut === undefined ? scoring.p : 0;
    const noteFor = picked => {
      const chosen = new Set(picked);
      // Une case est bien traitée si elle est cochée exactement quand elle est juste.
      const allWellTreated = Array.from({ length: count }, (_, index) => index)
        .every(index => chosen.has(index) === good.has(index));
      let note;
      if (chosen.size === 0 && good.size > 0) {
        note = scoring.v ?? 0;
      } else if (scoring.mz !== undefined) {
        note = allWellTreated ? scoring.mz : 0;
      } else if (multiple) {
        let sum = 0;
        for (let index = 0; index < count; index += 1) {
          sum += chosen.has(index) === good.has(index) ? b : m;
        }
        note = sum + d;
      } else {
        note = (allWellTreated ? b : m) + d;
      }
      if (floor !== undefined) note = Math.max(note, floor);
      if (scoring.P !== undefined) note = Math.min(note, scoring.P);
      return note;
    };
    return { score: noteFor(checked), max: scoring.MAX ?? noteFor(solution) };
  }

  // Analyse le contenu d’une balise {% … %} et renvoie sa description, ou lève une erreur explicite.
  function parseTag(source) {
    const tagSource = source.trim();
    const head = tagSource.match(/^([A-Za-z_]\w*)\s+(['"])([A-Za-z_]\w*)\2/);
    if (!head || !Object.hasOwn(tagSchemas, head[1])) {
      throw new Error(`Balise de modèle non prise en charge : {% ${tagSource} %}`);
    }
    const [, type, , name] = head;
    if (reservedNames.has(name)) {
      throw new Error(`Le nom de champ « ${name} » est réservé ; choisissez-en un autre dans {% ${tagSource} %}`);
    }
    const schema = tagSchemas[type];
    const attributes = {};
    const attributePattern = /^\s+([A-Za-z_]\w*)\s*=\s*(?:(\d+)|([A-Za-z_]\w*)|(['"])(.*?)\4)/s;
    let rest = tagSource.slice(head[0].length);

    while (rest.trim()) {
      const match = rest.match(attributePattern);
      if (!match) {
        throw new Error(`Syntaxe d’attribut invalide dans {% ${tagSource} %}`);
      }
      const [, key, integer, variable, , text] = match;
      if (!Object.hasOwn(schema, key)) {
        throw new Error(`Attribut « ${key} » inconnu pour ${type} dans {% ${tagSource} %}`);
      }
      if (Object.hasOwn(attributes, key)) {
        throw new Error(`Attribut « ${key} » répété dans {% ${tagSource} %}`);
      }
      const expected = schema[key];
      const value =
        expected === "integer" && integer !== undefined ? Number(integer)
          : expected === "variable" && variable !== undefined ? variable
            : expected === "dimension" && integer !== undefined ? Number(integer)
              : expected === "dimension" && variable !== undefined ? variable
                : expected === "text" && text !== undefined ? text
                  : undefined;
      if (value === undefined) {
        throw new Error(`L’attribut « ${key} » doit être ${typeDescriptions[expected]} dans {% ${tagSource} %}`);
      }
      attributes[key] = value;
      rest = rest.slice(match[0].length);
    }

    // Chaque champ désigne la variable de « avant » qui contient sa solution.
    if (!Object.hasOwn(attributes, "solution")) {
      throw new Error(`Le champ « ${name} » doit indiquer sa solution, par exemple solution=variable, dans {% ${tagSource} %}`);
    }

    // Une matrice fixe a soit une taille carrée, soit un nombre de lignes et de colonnes.
    if (type === "input_matrix") {
      const square = Object.hasOwn(attributes, "size");
      const rectangular = Object.hasOwn(attributes, "rows") || Object.hasOwn(attributes, "cols");
      if (square === rectangular ||
          (rectangular && !(Object.hasOwn(attributes, "rows") && Object.hasOwn(attributes, "cols")))) {
        throw new Error(`input_matrix exige soit size, soit rows et cols, dans {% ${tagSource} %}`);
      }
    }

    // Un champ à choix désigne la liste de ses choix ; colonnes et barème se vérifient sans Python.
    if (choiceTypes.has(type)) {
      if (!Object.hasOwn(attributes, "choices")) {
        throw new Error(`Le champ « ${name} » doit indiquer ses choix, par exemple choices=variable, dans {% ${tagSource} %}`);
      }
      if (Object.hasOwn(attributes, "columns") && !(attributes.columns >= 1 && attributes.columns <= 6)) {
        throw new Error(`L’attribut « columns » doit être compris entre 1 et 6 dans {% ${tagSource} %}`);
      }
      if (Object.hasOwn(attributes, "bareme")) {
        try {
          parseScoring(attributes.bareme);
        } catch (error) {
          throw new Error(`${error.message} dans {% ${tagSource} %}`);
        }
      }
    }
    return Object.freeze({ type, name, attributes: Object.freeze(attributes) });
  }

  // Analyse toutes les balises d’un modèle ; les balises invalides sont ignorées.
  function parseTags(template) {
    const tags = [];
    for (const [, source] of template.matchAll(tagPattern)) {
      try {
        tags.push(parseTag(source));
      } catch {
        // validateTemplate signale ces balises ; les autres fonctions les ignorent.
      }
    }
    return tags;
  }

  // Renvoie un message par balise invalide, pour signaler toutes les erreurs à la fois.
  function validateTemplate(template) {
    const errors = [];
    const tags = [];
    for (const [, source] of template.matchAll(tagPattern)) {
      try {
        tags.push(parseTag(source));
      } catch (error) {
        errors.push(error.message);
      }
    }
    // La note porte sur toute la question : elle n’a de sens que pour un champ à choix seul.
    const scored = tags.find(tag => Object.hasOwn(tag.attributes, "bareme"));
    if (scored && tags.length > 1) {
      errors.push(`Le barème du champ « ${scored.name} » n’est admis que si c’est le seul champ de la question.`);
    }
    return errors;
  }

  // Indique les types de balises présents, par exemple pour charger MathLive seulement s’il sert.
  function tagTypes(template) {
    return new Set(parseTags(template).map(tag => tag.type));
  }

  // Variables Python nécessaires à l’affichage : {{ variable }} et dimensions matricielles nommées.
  function templateVariables(template) {
    const names = new Set([...template.matchAll(variablePattern)].map(match => match[1]));
    for (const tag of parseTags(template)) {
      if (tag.type !== "input_matrix") continue;
      for (const key of ["size", "rows", "cols"]) {
        if (typeof tag.attributes[key] === "string") names.add(tag.attributes[key]);
      }
    }
    return names;
  }

  // Remplace chaque balise par le rendu fourni, puis chaque variable par sa valeur échappée.
  function renderTemplate(template, context, renderTag) {
    const withTags = template.replace(tagPattern, (_match, source) => renderTag(parseTag(source)));
    return withTags.replace(variablePattern, (_match, name) => {
      if (!Object.hasOwn(context, name)) {
        throw new Error(`Variable de question inconnue : ${name}`);
      }
      return escapeHtml(context[name]);
    });
  }

  return Object.freeze({
    tagPattern,
    variablePattern,
    reservedNames,
    choiceTypes,
    rawInputAttributes,
    escapeHtml,
    limitedHtml,
    parseScoring,
    scoreChoice,
    checkIdPrefix,
    parseTag,
    parseTags,
    validateTemplate,
    tagTypes,
    templateVariables,
    renderTemplate
  });
})();
