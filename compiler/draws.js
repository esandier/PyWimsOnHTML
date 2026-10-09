// Tirages : exécution de « question_setup » avec chaque graine, contrôles de l’auteur, cohérence de la
// correction, ordre des choix, et tirage provisoire de l’aperçu.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
  // Tirage provisoire, sans Python : chaque variable de l’énoncé est affichée sous son nom,
  // chaque dimension de matrice nommée vaut 2, et un champ à choix montre deux choix nommés
  // d’après leur liste (« choices[0] », « choices[1] »). Pour « Afficher la solution »
  // (SPECIFICATION.md, § 3), un champ texte ou formule montre le nom de sa variable de solution ;
  // une matrice, sans solution, montre des « ∗ », et aucun choix n’est coché.
  function previewPlaceholderDraw(fields) {
    const dimensions = {};
    const choices = {};
    const orders = {};
    const solutions = {};
    for (const tag of PyWimsTemplate.parseTags(fields.question_statement)) {
      if (["input_text", "input_value", "input_math"].includes(tag.type)) {
        solutions[tag.name] = tag.attributes.solution;
      }
      for (const key of ["size", "rows", "cols"]) {
        if (typeof tag.attributes[key] === "string") {
          dimensions[tag.attributes[key]] = 2;
        }
      }
      if (PyWimsTemplate.choiceTypes.has(tag.type)) {
        choices[tag.name] = [0, 1].map(index => `${tag.attributes.choices}[${index}]`);
        orders[tag.name] = [0, 1];
      }
    }
    const context = Object.fromEntries(displayedVariables(fields).map(name => [name, name]));
    return { seed: 0, context, dimensions, solutions, choices, orders };
  }

  // Variables affichées par la question : celles de l’énoncé et de l’explication de la solution,
  // qui s’écrit comme l’énoncé (SPECIFICATION.md, § 2.1). Leurs valeurs forment le « context » du tirage.
  function displayedVariables(fields) {
    return [...new Set([
      ...PyWimsTemplate.templateVariables(fields.question_statement),
      ...PyWimsTemplate.templateVariables(fields.question_solution_explanation ?? "")
    ])];
  }

  const drawCount = 20;
  // Durée maximale d’une exécution de « question_setup », ou de « question_check » pour le contrôle de cohérence
  // (SPECIFICATION.md, § 3) : une boucle sans fin arrête la compilation au lieu de la bloquer.
  const drawTimeoutMs = 30000;
  let drawSessionCounter = 0;

  // Résume une erreur Python : sa dernière ligne, précédée du numéro de ligne dans « question_setup ».
  function pythonErrorSummary(message) {
    const lines = String(message).trim().split("\n");
    const lineNumbers = [...String(message).matchAll(/File "<exec>", line (\d+)/g)].map(match => match[1]);
    return lineNumbers.length ? `ligne ${lineNumbers.at(-1)} : ${lines.at(-1)}` : lines.at(-1);
  }

  // Vérifie que chaque solution matricielle a les dimensions du champ qu’elle remplit.
  function matrixShapeErrors(tags, draw) {
    const errors = [];
    for (const tag of tags) {
      const cells = draw.solutions[tag.name];
      if (!Array.isArray(cells) || !["input_matrix", "input_vmatrix"].includes(tag.type)) {
        continue;
      }
      const rows = cells.length;
      const columns = rows ? cells[0].length : 0;
      const ragged = cells.some(row => row.length !== columns);
      const { attributes } = tag;
      if (tag.type === "input_matrix") {
        const dimension = value => (typeof value === "number" ? value : draw.dimensions[value]);
        const expectedRows = dimension(attributes.size ?? attributes.rows);
        const expectedColumns = dimension(attributes.size ?? attributes.cols);
        if (![expectedRows, expectedColumns].every(value => Number.isInteger(value) && value >= 1 && value <= 10)) {
          errors.push(`Les dimensions du champ « ${tag.name} » (${expectedRows} × ${expectedColumns}) doivent être comprises entre 1 et 10.`);
        } else if (ragged || rows !== expectedRows || columns !== expectedColumns) {
          errors.push(`La solution du champ « ${tag.name} » est une matrice ${rows} × ${columns}, alors que le champ est ${expectedRows} × ${expectedColumns}.`);
        }
      } else {
        const maxRows = attributes.max_rows ?? 10;
        const maxColumns = attributes.max_cols ?? 10;
        if (ragged || rows < 1 || columns < 1 || rows > maxRows || columns > maxColumns) {
          errors.push(`La solution du champ « ${tag.name} » est une matrice ${rows} × ${columns}, hors des limites ${maxRows} × ${maxColumns} du champ.`);
        }
      }
    }
    return errors;
  }

  // Contrôle de cohérence d’un tirage (SPECIFICATION.md, § 3) : la solution de chaque champ est
  // saisie comme le ferait un élève, puis « question_check » doit la juger juste. Sans ce contrôle, le bouton
  // « Solution » pourrait montrer une réponse que la correction refuse (fraction non simplifiée,
  // indices dans un autre ordre…), ou « question_check » planter pour un tirage rare. La session est celle
  // du tirage, où « question_setup » vient d’être exécuté ; elle est jetée ensuite. Renvoie les messages.
  async function coherenceErrors(session, tags, draw, question_check, timeoutMs = drawTimeoutMs) {
    if (question_check === undefined) {
      return defaultCoherenceErrors(tags, draw);
    }
    // Une valeur ANY accepte n’importe quelle saisie : « 1 » en tient lieu.
    const typed = value => value ?? "1";
    for (const tag of tags) {
      const { name, type, attributes } = tag;
      const solution = draw.solutions[name];
      if (PyWimsTemplate.choiceTypes.has(type)) {
        await session.setChoice(name, solution);
      } else if (type === "input_text") {
        await session.set(name, typed(solution));
      } else if (type === "input_value") {
        await session.set(name, typed(solution?.text));
      } else if (type === "input_math") {
        // MathLive transmet une expression en texte (« x^2 + 1 »), et non le LaTeX affiché par la
        // solution : on saisit donc la forme texte, la plus proche de ce que reçoit « question_check ».
        await session.set(name, typed(await session.run(`__import__("pywims")._solution_text(${attributes.solution})`)));
      } else {
        await session.setMatrix(name, solution.map(row => row.map(typed)));
      }
    }
    await session.resetAnswers();
    try {
      await session.run(question_check, { timeoutMs });
    } catch (error) {
      if (error.name === "PyWimsTimeout") {
        return [`« question_check » n’a pas terminé en ${timeoutMs / 1000} s quand on saisit la solution (boucle sans fin ?).`];
      }
      return [`« question_check » lève une erreur quand on saisit la solution, ${pythonErrorSummary(error.message)}`];
    }
    const errors = [];
    for (const tag of tags) {
      const solution = draw.solutions[tag.name];
      const matrix = ["input_matrix", "input_vmatrix"].includes(tag.type);
      const keys = matrix
        ? solution.flatMap((row, i) => row.map((_, j) => `${tag.name}[${i}][${j}]`))
        : [tag.name];
      const wrong = [];
      for (const key of keys) {
        if (!await session.getBoolean(`bool(ok_answer.get(${JSON.stringify(key)}, False))`)) {
          wrong.push(key);
        }
      }
      if (wrong.length) {
        const cells = matrix ? ` (case${wrong.length > 1 ? "s" : ""} ${wrong.map(key => key.slice(tag.name.length)).join(", ")})` : "";
        errors.push(`la solution du champ « ${tag.name} »${cells} est jugée fausse par « question_check ».`);
      }
    }
    // Le retour de l’auteur aide souvent à comprendre pourquoi la solution est refusée.
    if (errors.length && await session.getBoolean("'feedback' in globals()")) {
      errors.push(`Retour obtenu : « ${await session.getTemplateValue("feedback")} ».`);
    }
    return errors;
  }

  // Cohérence sans « question_check » : la solution, saisie comme le ferait un élève, doit être acceptée par
  // la correction par défaut (runtime/correction.js). C’est vrai par construction, sauf pour une
  // solution qu’aucun élève ne peut saisir : un texte vide (ou fait d’espaces) laisserait le champ
  // vide, et « Vérifier » resterait inactif. Le contrôle passe aussi par le même code que le
  // navigateur, ce qui vérifie la normalisation sur chaque solution réelle.
  function defaultCoherenceErrors(tags, draw) {
    const { isCorrect, normalizedText } = PyWimsCorrection;
    const errors = [];
    for (const { name, type, attributes } of tags) {
      const solution = draw.solutions[name];
      let wrong;
      if (PyWimsTemplate.choiceTypes.has(type)) {
        wrong = isCorrect(type, solution, solution) ? [] : [""];
      } else if (type === "input_value") {
        // La solution affichée (texte), saisie comme par un élève, doit être juste à la tolérance près
        // et dans la forme demandée : c’est ce qui vérifie l’arrondi de la solution affichée.
        wrong = solution === null || isCorrect(type, solution.text, solution, attributes) ? [] : [""];
      } else {
        // Une valeur libre (null) se saisit « 1 », comme dans le contrôle avec « question_check ».
        const cells = ["input_matrix", "input_vmatrix"].includes(type)
          ? solution.flatMap((row, i) => row.map((cell, j) => [`[${i}][${j}]`, cell]))
          : [["", solution]];
        wrong = cells
          .filter(([, cell]) => (cell !== null && normalizedText(cell) === "") || !isCorrect(type, cell ?? "1", cell, attributes))
          .map(([key]) => key);
      }
      if (wrong.length) {
        const where = wrong[0] ? ` (case${wrong.length > 1 ? "s" : ""} ${wrong.join(", ")})` : "";
        errors.push(`la solution du champ « ${name} »${where} est vide ou n’est pas acceptée par la correction par défaut.`);
      }
    }
    return errors;
  }

  // Solutions des champs input_value (SPECIFICATION.md, § 2.8) : Python donne la valeur exacte
  // ({ value: "n/d", exact }) ; on y ajoute le texte qu’écrit le bouton « Solution », selon form et
  // tolerance. Le tirage garde les deux : le texte pour l’affichage, la valeur pour la correction.
  // Renvoie les messages des solutions qui ne peuvent pas s’écrire ainsi.
  function valueSolutionErrors(tags, draw) {
    const errors = [];
    for (const { name, type, attributes } of tags) {
      const raw = draw.solutions[name];
      if (type !== "input_value" || raw === null || raw === undefined) continue;
      try {
        draw.solutions[name] = { text: PyWimsCorrection.valueSolutionText(raw, attributes), value: raw.value };
      } catch (error) {
        errors.push(`La solution « ${attributes.solution} » du champ « ${name} » : ${error.message}`);
        delete draw.solutions[name];
      }
    }
    return errors;
  }

  // Vérifie que les derniers choix fixés laissent au moins un choix à mélanger, et que deux choix
  // n’ont pas le même texte (SPECIFICATION.md, § 10.6). Des choix calculés coïncident facilement
  // pour un tirage rare (deux erreurs types qui donnent la même valeur) : l’élève verrait deux
  // choix identiques, dont un seul juste. Les textes sont comparés après la normalisation de la
  // correction par défaut : « x^2+1 » et « x^2 + 1 » s’affichent pareil.
  function choiceErrors(tags, draw) {
    const errors = [];
    for (const tag of tags) {
      const texts = draw.choices?.[tag.name];
      if (!Array.isArray(texts)) continue;
      const fixedLast = tag.attributes.fixed_last ?? 0;
      if (fixedLast >= texts.length) {
        errors.push(`fixed_last=${fixedLast} doit être inférieur au nombre de choix (${texts.length}) du champ « ${tag.name} ».`);
      }
      const seen = new Map();
      for (const [index, text] of texts.entries()) {
        const key = PyWimsCorrection.normalizedText(text);
        if (seen.has(key)) {
          errors.push(`Les choix ${seen.get(key)} et ${index} du champ « ${tag.name} » ont le même texte (« ${text} ») : l’élève ne peut pas les distinguer.`);
          break;
        }
        seen.set(key, index);
      }
    }
    return errors;
  }

  // Ordre d’affichage des choix d’un tirage : mélange de Fisher-Yates par un générateur déterministe
  // (mulberry32), initialisé par la graine et le nom du champ. Le « random » de l’auteur n’est pas
  // touché, donc le tirage rejoué par le navigateur reste identique ; deux champs d’une même question
  // ne sont pas mélangés de la même façon. Les fixedLast derniers choix restent à la fin, dans l’ordre.
  // shuffle=0 garde l’ordre de l’auteur (§ 10.2) : l’ordre ne varie plus d’un tirage à l’autre, et
  // les tirages identiques sont fusionnés.
  function choiceOrder(count, fixedLast, seed, name, shuffle = 1) {
    if (shuffle === 0) {
      return Array.from({ length: count }, (_, index) => index);
    }
    let state = seed >>> 0;
    for (const character of name) {
      state = Math.imul(state ^ character.codePointAt(0), 0x9e3779b1) >>> 0;
    }
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const order = Array.from({ length: count - fixedLast }, (_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let index = count - fixedLast; index < count; index += 1) {
      order.push(index);
    }
    return order;
  }

  // Exécute « question_setup » pour plusieurs graines et garde les tirages distincts. Chaque tirage
  // contient les valeurs affichées (énoncé et explication), les solutions converties, les choix et
  // leur ordre d’affichage.
  // La première erreur de l’auteur interrompt le calcul, avec la graine en cause.
  // timeoutMs : durée maximale de chaque exécution de « question_setup » et de « question_check » ; les tests la réduisent.
  // count : nombre de tirages imposé (aperçu, tests) ; sinon le champ « question_draws », ou 20.
  async function computeDraws(fields, { count: requested, onProgress, timeoutMs = drawTimeoutMs } = {}) {
    const count = requested ?? (fields.question_draws === undefined ? drawCount : Number(fields.question_draws));
    const tags = PyWimsTemplate.parseTags(fields.question_statement);
    const choiceTags = tags.filter(tag => PyWimsTemplate.choiceTypes.has(tag.type));
    const spec = {
      variables: displayedVariables(fields),
      dimensions: [...new Set(tags
        .filter(tag => tag.type === "input_matrix")
        .flatMap(tag => ["size", "rows", "cols"].map(key => tag.attributes[key]))
        .filter(value => typeof value === "string"))],
      fields: tags.map(tag => ({
        name: tag.name, type: tag.type, solution: tag.attributes.solution, choices: tag.attributes.choices
      }))
    };
    // Une formule TeX dans une chaîne ordinaire passe sans erreur Python mais s’affiche abîmée :
    // on la refuse avant tout tirage, pour les deux champs Python.
    // Une formule se corrige par une comparaison symbolique, donc par « question_check » (SPECIFICATION.md, § 2.6).
    const mathTag = fields.question_check === undefined && tags.find(tag => tag.type === "input_math");
    if (mathTag) {
      throw new Error(`Le champ « ${mathTag.name} » (input_math) exige un « question_check » : une formule se corrige par comparaison symbolique, par exemple simplify(math_expression(saisie) - solution) == 0.`);
    }
    const stringErrors = [
      ...await PyWimsPython.sourceErrors(fields.question_setup, "question_setup"),
      ...(fields.question_check === undefined ? [] : await PyWimsPython.sourceErrors(fields.question_check, "question_check"))
    ];
    if (stringErrors.length) {
      throw new Error(stringErrors.join(" "));
    }
    // Exécute « question_setup » avec la graine dans une session neuve et renvoie la session et le tirage ;
    // l’appelant libère la session.
    async function runDraw(seed) {
      drawSessionCounter += 1;
      const session = PyWimsPython.createSession(`compilation-${drawSessionCounter}`);
      try {
        // Les paquets à charger sont déduits des imports de tout le code Python de la question.
        await session.initialize(`${fields.question_setup}\n${fields.question_check ?? ""}`);
        try {
          await session.runSeeded(fields.question_setup, seed, { timeoutMs });
        } catch (error) {
          if (error.name === "PyWimsTimeout") {
            throw new Error(`« question_setup » n’a pas terminé en ${timeoutMs / 1000} s pour la graine ${seed} (boucle sans fin ?).`);
          }
          throw new Error(`Erreur dans « question_setup » pour la graine ${seed}, ${pythonErrorSummary(error.message)}`);
        }
        const draw = await session.collectDraw(spec);
        draw.errors.push(...valueSolutionErrors(tags, draw));
        return { session, draw };
      } catch (error) {
        await session.dispose();
        throw error;
      }
    }

    // Parties du tirage que le navigateur affiche ou utilise, comparées entre les deux exécutions.
    const drawParts = {
      context: "les valeurs de l’énoncé",
      dimensions: "les dimensions des matrices",
      solutions: "les solutions",
      choices: "les choix"
    };

    const draws = [];
    const seen = new Set();
    for (let seed = 0; seed < count; seed += 1) {
      const { session, draw } = await runDraw(seed);
      try {
        const errors = [...draw.errors, ...matrixShapeErrors(tags, draw), ...choiceErrors(tags, draw)];
        if (errors.length) {
          throw new Error(`Graine ${seed} : ${errors.join(" ")}`);
        }
        // Seconde exécution de la même graine (SPECIFICATION.md, § 3) : un hasard que la graine ne
        // fixe pas donnerait au navigateur un autre tirage que celui intégré au fichier.
        const twin = await runDraw(seed);
        await twin.session.dispose();
        const differing = Object.keys(drawParts)
          .filter(part => JSON.stringify(draw[part]) !== JSON.stringify(twin.draw[part]));
        if (differing.length) {
          throw new Error(`Graine ${seed} : deux exécutions de « question_setup » avec la même graine donnent des tirages différents (${differing.map(part => drawParts[part]).join(", ")}). Tirez le hasard uniquement avec le module random (ou numpy.random.seed) : le navigateur ne pourrait pas rejouer ce tirage.`);
        }
        // Les solutions ont la forme attendue : on peut les saisir et vérifier la correction.
        const incoherences = await coherenceErrors(session, tags, draw, fields.question_check, timeoutMs);
        if (incoherences.length) {
          throw new Error(`Graine ${seed} : ${incoherences.join(" ")}`);
        }
        const orders = Object.fromEntries(choiceTags.map(tag => [
          tag.name,
          choiceOrder(draw.choices[tag.name].length, tag.attributes.fixed_last ?? 0, seed, tag.name, tag.attributes.shuffle ?? 1)
        ]));
        // L’ordre fait partie du tirage : deux tirages qui ne diffèrent que par lui restent distincts.
        const key = JSON.stringify([draw.context, draw.solutions, draw.choices, orders]);
        if (!seen.has(key)) {
          seen.add(key);
          draws.push({
            seed,
            context: draw.context,
            dimensions: draw.dimensions,
            solutions: draw.solutions,
            choices: draw.choices,
            orders
          });
        }
      } finally {
        await session.dispose();
      }
      onProgress?.(seed + 1, count);
    }
    return draws;
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    previewPlaceholderDraw,
    choiceOrder,
    computeDraws
  });
})();
