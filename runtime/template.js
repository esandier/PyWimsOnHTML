// Grammaire unique des modèles de question, partagée par le compilateur et la question générée.
// L’énoncé et l’explication sont des modèles Jinja, rendus par Python à la compilation
// (SPECIFICATION.md, § 2.10) ; ce fichier ne lit que les champs de réponse, sans Python, et affiche
// l’énoncé rendu.
window.PyWimsTemplate = (() => {
  // Champ de réponse : {{ input_value('n', solution=s, tolerance=0.01) }}. Un texte entre guillemets
  // peut contenir une parenthèse (style='width:calc(…)') ; il est sauté d’un bloc.
  const fieldPattern = /\{\{-?\s*(input_[A-Za-z_]+)\s*\(((?:[^()'"]|'[^']*'|"[^"]*")*)\)\s*-?\}\}/g;
  // Ancienne notation, refusée avec un message qui donne la nouvelle (SPECIFICATION.md, § 2.3).
  const legacyFieldPattern = /\{%\s*(input_[A-Za-z_]+)\b([\s\S]*?)%\}/g;
  // Marque d’un champ dans le modèle donné à Jinja (« \u0001nom\u0001 ») : Jinja la laisse telle quelle,
  // et la page la remplace par le champ, dont le HTML dépend de la page (identifiants q2-…, état).
  // Un caractère de contrôle ne peut venir ni de l’auteur ni d’une formule.
  const markCharacter = "\u0001";
  const markPattern = /\u0001([^\u0001]+)\u0001/gu;
  const fieldMark = name => `${markCharacter}${name}${markCharacter}`;
  // Nom de variable : la règle des identifiants de Python, lettres accentuées comprises (« résultat »),
  // puisque chaque nom désigne une variable de « question_setup ». Python ramène un nom à sa forme
  // NFKC : un « é » tapé en deux caractères (e + accent) désigne la même variable que « é » ; pythonName
  // fait de même ici, sans quoi la variable serait introuvable dans l’espace Python. Solution écartée :
  // les seules lettres ASCII, que Python n’impose pas et qu’un auteur francophone ne devine pas.
  const nameSource = String.raw`[\p{ID_Start}_]\p{ID_Continue}*`;
  const namePattern = new RegExp(`^${nameSource}$`, "u");
  const isName = name => typeof name === "string" && namePattern.test(name);
  const pythonName = name => name.normalize("NFKC");
  // Formule d’un énoncé rendu, avec les délimiteurs de MathJax (compiler/assemble.js).
  const mathPattern = /\$\$[\s\S]*?\$\$|(?<!\\)\$(?:\\[\s\S]|[^$\\])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;

  // Types d’attributs : entier, nombre décimal positif (gardé en texte, pour une valeur exacte), nom
  // de variable Python, dimension (entier ou variable), texte entre guillemets, ou liste de mots
  // admis, écrits avec ou sans guillemets (form=decimal ou form='decimal').
  const tagSchemas = {
    input_text: { style: "text", solution: "variable", match: ["exact", "normal", "loose"] },
    input_value: {
      style: "text", solution: "variable", tolerance: "number",
      form: ["any", "integer", "decimal", "fraction", "irreducible", "scientific", "percent"]
    },
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
      columns: "integer", shuffle: "integer", fixed_last: "integer", scoring: "text"
    },
    // Liste déroulante d’un texte à trous (SPECIFICATION.md, § 2.9) : ni colonnes ni barème.
    input_select: { choices: "variable", solution: "variable", shuffle: "integer", fixed_last: "integer" },
    input_checkbox: {
      choices: "variable", solution: "variable",
      columns: "integer", shuffle: "integer", fixed_last: "integer", scoring: "text"
    }
  };
  // Champs à choix : leurs choix viennent d’une liste de « question_setup » et peuvent porter un barème.
  const choiceTypes = new Set(["input_radio", "input_checkbox", "input_select"]);
  // Directives de barème d’AMC prises en charge. « e » est acceptée sans effet, car une saisie
  // incohérente est impossible ici : un barème d’AMC se recopie ainsi tel quel.
  const scoringDirectives = new Set(["b", "m", "d", "p", "P", "mz", "haut", "MAX", "v", "e"]);
  // Directives d’AMC connues mais non prises en charge : le message le dit, au lieu de « inconnue ».
  const unsupportedScoring = /^(formula|auto|SUF|allowempty|(set|setglobal|default|requires)\..+)$/;
  // Un champ porte le nom de la variable Python qui reçoit la saisie : il ne doit pas
  // écraser une variable du contrat de question, un outil pywims ni un mot-clé Python.
  const reservedNames = new Set([
    "ok_answer", "feedback",
    "math_expression", "mcq", "tex", "ANY", "pywims",
    "False", "None", "True", "and", "as", "assert", "async", "await", "break",
    "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
    "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
    "or", "pass", "raise", "return", "try", "while", "with", "yield"
  ]);
  const typeDescriptions = {
    integer: "un entier",
    number: "un nombre positif, par exemple 0.01",
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

  // Analyse un champ, écrit {{ input_value('n', solution=s) }} ou sans accolades
  // (« input_value('n', solution=s) »), et renvoie sa description, ou lève une erreur explicite.
  // L’appel est lu, jamais exécuté : la page connaît ainsi ses champs sans Python (SPECIFICATION.md,
  // § 2.3). Une valeur est donc un nombre, un texte entre guillemets ou un nom de variable.
  function parseTag(source) {
    const shown = source.trim().startsWith("{{") ? source.trim() : `{{ ${source.trim()} }}`;
    const call = shown.replace(/^\{\{-?\s*/, "").replace(/\s*-?\}\}$/, "");
    const head = call.match(new RegExp(String.raw`^(${nameSource})\s*\(\s*(['"])(${nameSource})\2`, "u"));
    if (!head || !Object.hasOwn(tagSchemas, head[1]) || !call.endsWith(")")) {
      throw new Error(`Champ de réponse non pris en charge : ${shown}`);
    }
    const [, type, , rawName] = head;
    const name = pythonName(rawName);
    if (reservedNames.has(name)) {
      throw new Error(`Le nom de champ « ${name} » est réservé ; choisissez-en un autre dans ${shown}`);
    }
    const schema = tagSchemas[type];
    const attributes = {};
    const attributePattern = new RegExp(
      String.raw`^\s*,\s*(${nameSource})\s*=\s*(?:(\d+(?:\.\d+)?|\.\d+)|(${nameSource})|(['"])(.*?)\4)(?=\s*(?:,|$))`, "su");
    let rest = call.slice(head[0].length, -1);

    while (rest.trim()) {
      const match = rest.match(attributePattern);
      if (!match) {
        // Le plus souvent une expression (solution=p*2) : seul un nom est lu, sans Python.
        throw new Error(`Attribut invalide dans ${shown} : écrivez nom=valeur, séparés par des virgules ; une valeur est un nombre, un texte entre guillemets ou un nom de variable, pas une expression (calculez-la dans « question_setup »)`);
      }
      const [, key, number, rawVariable, , text] = match;
      const variable = rawVariable === undefined ? undefined : pythonName(rawVariable);
      const integer = number !== undefined && /^\d+$/.test(number) ? number : undefined;
      if (!Object.hasOwn(schema, key)) {
        throw new Error(`Attribut « ${key} » inconnu pour ${type} dans ${shown}`);
      }
      if (Object.hasOwn(attributes, key)) {
        throw new Error(`Attribut « ${key} » répété dans ${shown}`);
      }
      const expected = schema[key];
      const word = variable ?? text;
      const value =
        Array.isArray(expected) ? (expected.includes(word) ? word : undefined)
        : expected === "number" && number !== undefined ? number
        : expected === "integer" && integer !== undefined ? Number(integer)
          : expected === "variable" && variable !== undefined ? variable
            : expected === "dimension" && integer !== undefined ? Number(integer)
              : expected === "dimension" && variable !== undefined ? variable
                : expected === "text" && text !== undefined ? text
                  : undefined;
      if (value === undefined) {
        const description = Array.isArray(expected)
          ? `l’une des valeurs ${expected.join(", ")}`
          : typeDescriptions[expected];
        throw new Error(`L’attribut « ${key} » doit être ${description} dans ${shown}`);
      }
      attributes[key] = value;
      rest = rest.slice(match[0].length);
    }

    // Chaque champ désigne la variable de « question_setup » qui contient sa solution.
    if (!Object.hasOwn(attributes, "solution")) {
      throw new Error(`Le champ « ${name} » doit indiquer sa solution, par exemple solution=variable, dans ${shown}`);
    }

    // Une matrice fixe a soit une taille carrée, soit un nombre de lignes et de colonnes.
    if (type === "input_matrix") {
      const square = Object.hasOwn(attributes, "size");
      const rectangular = Object.hasOwn(attributes, "rows") || Object.hasOwn(attributes, "cols");
      if (square === rectangular ||
          (rectangular && !(Object.hasOwn(attributes, "rows") && Object.hasOwn(attributes, "cols")))) {
        throw new Error(`input_matrix exige soit size, soit rows et cols, dans ${shown}`);
      }
    }

    // Un champ à choix désigne la liste de ses choix ; colonnes et barème se vérifient sans Python.
    if (choiceTypes.has(type)) {
      if (!Object.hasOwn(attributes, "choices")) {
        throw new Error(`Le champ « ${name} » doit indiquer ses choix, par exemple choices=variable, dans ${shown}`);
      }
      if (Object.hasOwn(attributes, "columns") && !(attributes.columns >= 1 && attributes.columns <= 6)) {
        throw new Error(`L’attribut « columns » doit être compris entre 1 et 6 dans ${shown}`);
      }
      if (Object.hasOwn(attributes, "shuffle") && ![0, 1].includes(attributes.shuffle)) {
        throw new Error(`L’attribut « shuffle » doit valoir 0 ou 1 dans ${shown}`);
      }
      // Sans mélange, tous les choix restent à leur place : fixed_last ne dirait rien, et sa présence
      // trahit presque toujours une confusion de l’auteur.
      if (attributes.shuffle === 0 && Object.hasOwn(attributes, "fixed_last")) {
        throw new Error(`fixed_last est sans effet avec shuffle=0, qui garde déjà tous les choix à leur place, dans ${shown}`);
      }
      if (Object.hasOwn(attributes, "scoring")) {
        try {
          parseScoring(attributes.scoring);
        } catch (error) {
          throw new Error(`${error.message} dans ${shown}`);
        }
      }
    }
    return Object.freeze({ type, name, attributes: Object.freeze(attributes) });
  }

  // Analyse tous les champs d’un modèle, dans l’ordre ; les champs invalides sont ignorés.
  function parseTags(template) {
    const tags = [];
    for (const [source] of template.matchAll(fieldPattern)) {
      try {
        tags.push(parseTag(source));
      } catch {
        // validateTemplate signale ces champs ; les autres fonctions les ignorent.
      }
    }
    return tags;
  }

  // Nouvelle écriture d’un champ de l’ancienne notation, pour le message qui la refuse :
  // {% input_value 'n' solution=s tolerance=0.01 %} → {{ input_value('n', solution=s, tolerance=0.01) }}.
  function legacyFieldCall(type, rest) {
    const parts = [...rest.matchAll(/(['"])(?:(?!\1).)*\1|[^\s=]+\s*=\s*(?:(['"])(?:(?!\2).)*\2|\S+)/gs)]
      .map(([part]) => part.replace(/\s*=\s*/, "="));
    return `{{ ${type}(${parts.join(", ")}) }}`;
  }

  // Erreurs d’écriture d’un modèle, communes à l’énoncé et à l’explication, trouvées sans Python :
  // ancienne notation des champs, et trois accolades de suite, où Jinja lirait « {{ » suivi de
  // « {n} » et donnerait un message incompréhensible (SPECIFICATION.md, § 2.4).
  function syntaxErrors(template) {
    const errors = [];
    for (const [source, type, rest] of template.matchAll(legacyFieldPattern)) {
      errors.push(`La notation des champs a changé : écrivez ${legacyFieldCall(type, rest)} au lieu de ${source}`);
    }
    if (/\{\{\{/.test(template)) {
      errors.push("Trois accolades de suite (par exemple \\frac{{{n}}}{2}) : Jinja y lit « {{ » suivi de « {n} » ; écrivez \\frac{ {{n}} }{2}, avec des espaces.");
    }
    return errors;
  }

  // Renvoie un message par erreur de l’énoncé, pour les signaler toutes à la fois.
  function validateTemplate(template) {
    const errors = syntaxErrors(template);
    const tags = [];
    for (const [source] of template.matchAll(fieldPattern)) {
      try {
        tags.push(parseTag(source));
      } catch (error) {
        errors.push(error.message);
      }
    }
    // Chaque champ est désigné par son nom : sa marque dans l’énoncé rendu, sa variable dans Python.
    const names = tags.map(tag => tag.name);
    for (const name of new Set(names.filter((name, index) => names.indexOf(name) !== index))) {
      errors.push(`Deux champs portent le nom « ${name} » : donnez-leur des noms différents.`);
    }
    // La note porte sur toute la question : elle n’a de sens que pour un champ à choix seul.
    const scored = tags.find(tag => Object.hasOwn(tag.attributes, "scoring"));
    if (scored && tags.length > 1) {
      errors.push(`Le barème du champ « ${scored.name} » n’est admis que si c’est le seul champ de la question.`);
    }
    return errors;
  }

  // Indique les types de champs présents, par exemple pour charger MathLive seulement s’il sert.
  function tagTypes(template) {
    return new Set(parseTags(template).map(tag => tag.type));
  }

  // Modèle donné à Jinja : chaque champ remplacé par sa marque, suivie des retours à la ligne de son
  // écriture, pour que les numéros de ligne des erreurs de Jinja restent ceux du champ de l’auteur.
  // Le code de Jinja ({{ … }}, {% … %}) est ramené à la forme NFKC, comme Python le fait pour ses
  // noms : sans cela, un « é » tapé en deux caractères ne désignerait pas la variable « é » de
  // « question_setup » (Jinja ne normalise pas). Le texte hors des délimiteurs reste tel quel.
  function jinjaSource(template) {
    return template
      .replace(fieldPattern, source => {
        const tag = parseTag(source);
        return fieldMark(tag.name) + "\n".repeat((source.match(/\n/g) ?? []).length);
      })
      .replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, code => code.normalize("NFKC"));
  }

  // Affiche un énoncé ou une explication rendus par Jinja (SPECIFICATION.md, § 2.10) : le « < » des
  // formules est échappé, puis chaque marque est remplacée par le champ que fournit renderTag.
  // Le « < » : l’énoncé est du HTML de l’auteur, et dans « $x_1<x_2$ » le navigateur lisait « <x_2$ … »
  // comme une balise, qui avalait la fin de l’énoncé (SPECIFICATION.md, § 2.1). Fait sur l’énoncé rendu,
  // il protège aussi les valeurs insérées dans une formule. Les marques ne contiennent pas de « $ » :
  // un « $ » d’un attribut de champ (style) ne peut plus passer pour le début d’une formule. « \$ » est
  // un dollar littéral (processEscapes de MathJax), jamais un délimiteur.
  // Solution écartée : demander aux auteurs d’écrire « \lt » ; les questions converties d’AMC et
  // celles des enseignants contiennent « < » tel quel.
  function renderStatement(rendered, tags, renderTag) {
    const byName = new Map(tags.map(tag => [tag.name, tag]));
    return rendered
      .replace(mathPattern, formula => formula.replaceAll("<", "&lt;"))
      .replace(markPattern, (_mark, name) => {
        if (!byName.has(name)) {
          throw new Error(`Champ de question inconnu : ${name}`);
        }
        return renderTag(byName.get(name));
      });
  }

  // Nombre d’apparitions de la marque d’un champ dans un énoncé rendu : 1 pour chaque champ, sinon le
  // champ est dans un {% if %} ou un {% for %} (SPECIFICATION.md, § 2.3).
  function markCount(rendered, name) {
    return rendered.split(fieldMark(name)).length - 1;
  }

  return Object.freeze({
    fieldPattern,
    isName,
    pythonName,
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
    syntaxErrors,
    validateTemplate,
    tagTypes,
    jinjaSource,
    renderStatement,
    markCount
  });
})();
