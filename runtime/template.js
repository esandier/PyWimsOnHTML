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
    }
  };
  // Un champ porte le nom de la variable Python qui reçoit la saisie : il ne doit pas
  // écraser une variable du contrat d’exercice, un outil pywims ni un mot-clé Python.
  const reservedNames = new Set([
    "ok_answer", "feedback", "explication_solution",
    "py_wims", "is_nombre", "math_expression", "LIBRE", "pywims",
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

  // Protège une valeur avant son insertion dans du HTML, y compris dans un attribut.
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Préfixe des identifiants d’une question (« q2- ») ; vide pour un champ hors feuille.
  function checkIdPrefix(prefix = "") {
    if (prefix !== "" && !/^[A-Za-z][\w-]*$/.test(prefix)) {
      throw new Error(`Préfixe d’identifiant invalide : ${prefix}`);
    }
    return prefix;
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
    for (const [, source] of template.matchAll(tagPattern)) {
      try {
        parseTag(source);
      } catch (error) {
        errors.push(error.message);
      }
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
        throw new Error(`Variable d’exercice inconnue : ${name}`);
      }
      return escapeHtml(context[name]);
    });
  }

  return Object.freeze({
    tagPattern,
    variablePattern,
    reservedNames,
    escapeHtml,
    checkIdPrefix,
    parseTag,
    parseTags,
    validateTemplate,
    tagTypes,
    templateVariables,
    renderTemplate
  });
})();
