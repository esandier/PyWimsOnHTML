// Tirages : exécution de « question_setup » avec chaque graine, rendu de l’énoncé par Jinja, contrôles
// de l’auteur, cohérence de la correction et ordre des choix.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
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

  // Widgets du moteur (SPECIFICATION.md, § 2.11) : la liste de widgets/widgets.json, puis la déclaration
  // de chacun (widget.json) et les fichiers qu’elle nomme : les siens (« files » : widget.py, widget.js,
  // widget.css) et les bibliothèques communes (« libraries », widgets/lib/*.js et *.py). Le moteur ne
  // connaît aucun widget par son nom : ajouter un widget, c’est ajouter son dossier et son nom dans
  // widgets.json (un serveur web ne donne pas la liste d’un dossier, d’où aussi la liste des fichiers).
  // Les scripts sont exécutés aussi dans la page du compilateur : le contrôle de cohérence corrige la
  // solution avec le même code que la page de l’élève. Tous les textes sont gardés pour l’assemblage
  // (widgetResources) et pour Python (pythonModules) : la page compilée intègre exactement le code qui a
  // contrôlé ses tirages.
  const scriptBase = document.currentScript.src;
  const widgetsBase = new URL("../widgets/", scriptBase);
  let widgetsLoading = null;
  let loadedWidgets = null;
  const texts = new Map();
  async function readText(url, label) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Fichier du moteur introuvable : « ${label} » (${response.status}).`);
    }
    return response.text();
  }
  const ownFiles = (name, extension) => loadedWidgets[name].declaration.files
    .filter(file => file.endsWith(extension)).map(file => `${name}/${file}`);
  const libraries = (name, extension) => loadedWidgets[name].declaration.libraries.filter(path => path.endsWith(extension));
  // Fichiers d’une extension pour des widgets : les bibliothèques d’abord, chacune une fois, puis ceux
  // de chaque widget, dans l’ordre des noms (le code d’un widget utilise ses bibliothèques).
  const filesOf = (names, extension) => [...new Set([
    ...names.flatMap(name => libraries(name, extension)),
    ...names.flatMap(name => ownFiles(name, extension))
  ])];
  function loadWidgets() {
    if (!widgetsLoading) {
      const read = path => readText(new URL(path, widgetsBase), `widgets/${path}`);
      widgetsLoading = (async () => {
        const names = JSON.parse(await read("widgets.json"));
        loadedWidgets = Object.fromEntries(await Promise.all(names.map(async name =>
          [name, { declaration: JSON.parse(await read(`${name}/widget.json`)) }])));
        const paths = [...new Set(names.flatMap(name => [
          ...loadedWidgets[name].declaration.libraries,
          ...loadedWidgets[name].declaration.files.map(file => `${name}/${file}`)
        ]))];
        (await Promise.all(paths.map(read))).forEach((text, index) => texts.set(paths[index], text));
        for (const path of filesOf(names, ".js")) {
          const script = document.createElement("script");
          script.textContent = texts.get(path);
          document.head.append(script);
        }
        return loadedWidgets;
      })();
      widgetsLoading.catch(() => { widgetsLoading = null; loadedWidgets = null; });
    }
    return widgetsLoading;
  }

  function loadedNames() {
    if (!loadedWidgets) throw new Error("Les widgets ne sont pas chargés : calculez d’abord les tirages.");
    return Object.keys(loadedWidgets);
  }

  // Code des widgets d’une feuille, pour l’assemblage (resources.widgets) : scripts et styles de ceux
  // qu’emploient ses tirages, une fois par page ; modules Python des éléments, que « question_check »
  // peut appeler (from pywims import interval) même si l’énoncé ne les emploie pas. Les champs sont
  // ceux de chaque tirage ; les éléments, ceux que computeDraws a relevés (draws.elements).
  function widgetResources(questions) {
    const all = loadedNames();
    const used = new Set(questions.flatMap(({ draws }) =>
      [...draws.flatMap(draw => draw.fields.map(field => field.type)), ...(draws.elements ?? [])]));
    const names = all.filter(name => used.has(name)).sort();
    return {
      js: filesOf(names, ".js").map(path => texts.get(path)).join("\n"),
      css: filesOf(names, ".css").map(path => texts.get(path)).join("\n"),
      python: widgetModules(all.filter(name => loadedWidgets[name].declaration.kind === "element"))
    };
  }

  // Paquet Python pywims_widgets : le dossier widgets/ tel quel (widget.py et bibliothèques .py des
  // widgets nommés), et la liste des éléments, que pywims offre à l’auteur (runtime/pywims.py).
  function widgetModules(names) {
    const elements = loadedNames().filter(name => loadedWidgets[name].declaration.kind === "element");
    return Object.fromEntries([
      ["pywims_widgets/__init__.py", `ELEMENTS = ${JSON.stringify(elements)}\n`],
      ...filesOf(names, ".py").map(path => [`pywims_widgets/${path}`, texts.get(path)])
    ]);
  }

  // Modules Python de la compilation : le module de l’auteur (pywims, lu avec les autres fichiers du
  // projet), le rendu des tirages (compiler/pywims_draws.py) et tous les widgets.
  let drawsModule = null;
  async function pythonModules(pywims) {
    await loadWidgets();
    drawsModule ??= readText(new URL("pywims_draws.py", scriptBase), "compiler/pywims_draws.py")
      .catch(error => { drawsModule = null; throw error; });
    return { "pywims.py": pywims, "pywims_draws.py": await drawsModule, ...widgetModules(loadedNames()) };
  }

  // Ce que Python reçoit pour rendre un tirage d’une question (pywims_draws.collect_draw) : ses modèles,
  // la présence d’un « question_check » et la déclaration de chaque widget.
  async function drawSpec(fields) {
    const widgets = await loadWidgets();
    return {
      statement: fields.question_statement,
      explanation: fields.question_solution_explanation ?? null,
      has_check: fields.question_check !== undefined,
      widgets: Object.fromEntries(Object.entries(widgets).map(([name, { declaration }]) => [name, declaration]))
    };
  }

  // Champs d’un tirage, comparés à ceux du premier : un champ dans un {% if %} manque à certains
  // tirages, et correction, contrôles et « question_check » supposent les mêmes champs partout (§ 2.3).
  function fieldListErrors(reference, fields) {
    const describe = list => list.map(({ name, type }) => `${name}:${type}`).join(",");
    if (describe(reference) === describe(fields)) return [];
    const names = new Set(fields.map(field => field.name));
    const missing = reference.find(field => !names.has(field.name)) ??
      fields.find(field => !reference.some(known => known.name === field.name)) ?? fields[0];
    return [`Le champ « ${missing.name} » n’apparaît pas de la même façon dans tous les tirages : un champ ne peut pas être placé dans un {% if %}.`];
  }

  // Barème d’AMC (SPECIFICATION.md, § 10.5) : sa syntaxe, et la règle d’un champ à choix seul dans sa
  // question, la note portant sur toute la question.
  function scoringErrors(fields) {
    const errors = [];
    for (const { name, attributes } of fields.filter(field => Object.hasOwn(field.attributes, "scoring"))) {
      try {
        PyWimsTemplate.parseScoring(attributes.scoring);
      } catch (error) {
        errors.push(`${error.message}, dans le champ « ${name} ».`);
      }
      if (fields.length > 1) {
        errors.push(`Le barème du champ « ${name} » n’est admis que si c’est le seul champ de la question.`);
      }
    }
    return errors;
  }

  // Contrôle de cohérence d’un tirage (SPECIFICATION.md, § 3) : chaque champ reçoit la réponse d’un élève
  // qui saisit la solution (typedAnswer de son widget), et chaque clé doit être jugée juste. Sans ce
  // contrôle, le bouton « Solution » pourrait montrer une réponse que la correction refuse (fraction non
  // simplifiée, indices dans un autre ordre…), ou « question_check » planter pour un tirage rare.
  // La réponse passe par la correction par défaut du widget, le même code que dans la page. Avec un
  // « question_check », Python est préparé comme dans la page (runtime/question.js) : ok_answer pré-rempli
  // par ces verdicts, saisie transmise par sendToPython. La session est celle du tirage, où
  // « question_setup » vient d’être exécuté ; elle est jetée ensuite. Renvoie les messages.
  // Une solution vide (ou faite d’espaces) ne peut pas se saisir : le champ resterait vide, et
  // « Vérifier » inactif. Une réponse est un texte, des lignes de textes (matrice) ou des indices.
  async function coherenceErrors(session, draw, question_check, timeoutMs = drawTimeoutMs) {
    const prefilled = {};
    const values = {};
    const keysOf = new Map();
    const empty = new Set();
    for (const field of draw.fields) {
      const widget = PyWimsWidgets.get(field.type);
      const answer = widget.typedAnswer(field, draw);
      const { verdicts } = widget.verdicts(answer, field, draw);
      keysOf.set(field, Object.keys(verdicts));
      for (const [key, verdict] of Object.entries(verdicts)) {
        if (verdict !== null) prefilled[key] = verdict;
      }
      const texts = typeof answer === "string" ? [[field.name, answer]]
        : Array.isArray(answer) && answer.every(Array.isArray)
          ? answer.flatMap((row, i) => row.map((cell, j) => [`${field.name}[${i}][${j}]`, cell])) : [];
      texts.filter(([, text]) => PyWimsCorrection.normalizedText(String(text)) === "").forEach(([key]) => empty.add(key));
      if (question_check !== undefined) await widget.sendToPython(session, field, answer, draw, values);
    }
    const report = async (judge, reason) => {
      const errors = [];
      for (const [field, keys] of keysOf) {
        const wrong = [];
        for (const key of keys) {
          if (empty.has(key) || !await judge(key)) wrong.push(key);
        }
        if (wrong.length) {
          const cells = wrong[0] === field.name ? ""
            : ` (case${wrong.length > 1 ? "s" : ""} ${wrong.map(key => key.slice(field.name.length)).join(", ")})`;
          errors.push(`la solution du champ « ${field.name} »${cells} ${reason}.`);
        }
      }
      return errors;
    };
    if (question_check === undefined) {
      return report(key => prefilled[key] === true, "est vide ou n’est pas acceptée par la correction par défaut");
    }
    await session.prepareCheck({ verdicts: prefilled, values });
    try {
      await session.run(question_check, { timeoutMs });
    } catch (error) {
      if (error.name === "PyWimsTimeout") {
        return [`« question_check » n’a pas terminé en ${timeoutMs / 1000} s quand on saisit la solution (boucle sans fin ?).`];
      }
      return [`« question_check » lève une erreur quand on saisit la solution, ${pythonErrorSummary(error.message)}`];
    }
    const errors = await report(key => session.getBoolean(`bool(ok_answer.get(${JSON.stringify(key)}, False))`),
      "est jugée fausse par « question_check »");
    // Le retour de l’auteur aide souvent à comprendre pourquoi la solution est refusée.
    if (errors.length && await session.getBoolean("'feedback' in globals()")) {
      errors.push(`Retour obtenu : « ${await session.getTemplateValue("feedback")} ».`);
    }
    return errors;
  }

  // Solutions complétées par la page (completeSolution de chaque widget) : la valeur exacte d’un champ
  // input_value reçoit le texte qu’écrit le bouton « Solution », selon form et tolerance (§ 2.8), que
  // la correction de la page sait seule écrire. Renvoie les messages des solutions refusées.
  function completeSolutions(draw) {
    const errors = [];
    for (const field of draw.fields) {
      try {
        draw.solutions[field.name] = PyWimsWidgets.get(field.type).completeSolution(draw.solutions[field.name], field);
      } catch (error) {
        errors.push(`La solution du champ « ${field.name} » : ${error.message}`);
        delete draw.solutions[field.name];
      }
    }
    return errors;
  }

  // Vérifie que deux choix n’ont pas le même texte (SPECIFICATION.md, § 10.6). Des choix calculés
  // coïncident facilement pour un tirage rare (deux erreurs types qui donnent la même valeur) : l’élève
  // verrait deux choix identiques, dont un seul juste. Les textes sont comparés après la normalisation
  // de la correction par défaut : « x^2+1 » et « x^2 + 1 » s’affichent pareil.
  function choiceErrors(draw) {
    const errors = [];
    for (const tag of draw.fields) {
      const texts = draw.choices?.[tag.name];
      if (!Array.isArray(texts)) continue;
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
  // shuffle=false garde l’ordre de l’auteur (§ 10.2) : l’ordre ne varie plus d’un tirage à l’autre, et
  // les tirages identiques sont fusionnés.
  function choiceOrder(count, fixedLast, seed, name, shuffle = true) {
    if (!shuffle) {
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
    // Les modèles sont rendus par Python, tirage par tirage (SPECIFICATION.md, § 2.10) ; Jinja y appelle
    // les widgets, qui notent les champs du tirage (§ 2.11).
    const spec = await drawSpec(fields);
    const isChoice = tag => spec.widgets[tag.type].choices === true;
    // Une formule TeX dans une chaîne ordinaire passe sans erreur Python mais s’affiche abîmée :
    // on la refuse avant tout tirage, pour les deux champs Python.
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
        // Les paquets à charger sont déduits des imports de tout le code Python de la question ; Jinja
        // est chargé par collectDraw.
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
        draw.errors.push(...completeSolutions(draw));
        return { session, draw };
      } catch (error) {
        await session.dispose();
        throw error;
      }
    }

    // Parties du tirage que le navigateur affiche ou utilise, comparées entre les deux exécutions.
    const drawParts = {
      statement: "l’énoncé",
      explanation: "l’explication",
      context: "les valeurs de l’énoncé",
      fields: "les champs",
      solutions: "les solutions",
      choices: "les choix",
      ranks: "les choix gardés d’un bloc"
    };

    const draws = [];
    const seen = new Set();
    const warnings = new Set();
    const elements = new Set();
    // Champs du premier tirage : tous les autres doivent avoir les mêmes.
    let reference = null;
    for (let seed = 0; seed < count; seed += 1) {
      const { session, draw } = await runDraw(seed);
      try {
        const errors = [...draw.errors];
        if (!errors.length) {
          reference ??= draw.fields;
          errors.push(...choiceErrors(draw), ...scoringErrors(draw.fields), ...fieldListErrors(reference, draw.fields));
        }
        draw.warnings.forEach(warning => warnings.add(warning));
        draw.elements.forEach(element => elements.add(element));
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
        const incoherences = await coherenceErrors(session, draw, fields.question_check, timeoutMs);
        if (incoherences.length) {
          throw new Error(`Graine ${seed} : ${incoherences.join(" ")}`);
        }
        const orders = Object.fromEntries(draw.fields.filter(isChoice).map(tag => [
          tag.name,
          choiceOrder(draw.choices[tag.name].length, tag.attributes.fixed_last ?? 0, seed, tag.name, tag.attributes.shuffle ?? true)
        ]));
        // Les valeurs de l’énoncé ne servent qu’à contrôler que Python rejoue ce tirage, donc qu’à une
        // question qui a un « question_check » : ailleurs, elles pesaient près d’un quart des tirages.
        const context = fields.question_check === undefined ? undefined : draw.context;
        // L’ordre fait partie du tirage : deux tirages qui ne diffèrent que par lui restent distincts.
        const ranks = Object.keys(draw.ranks ?? {}).length ? draw.ranks : undefined;
        const key = JSON.stringify([draw.statement, draw.explanation, context, draw.fields, draw.solutions, draw.choices, orders, ranks]);
        if (!seen.has(key)) {
          seen.add(key);
          draws.push({
            seed,
            statement: draw.statement,
            ...(draw.explanation === null ? {} : { explanation: draw.explanation }),
            ...(context === undefined ? {} : { context }),
            // Les champs du tirage et leurs attributs (SPECIFICATION.md, § 2.11) : la page les dessine
            // sans relire l’énoncé.
            fields: draw.fields,
            solutions: draw.solutions,
            choices: draw.choices,
            orders,
            ...(ranks === undefined ? {} : { ranks })
          });
        }
      } finally {
        await session.dispose();
      }
      onProgress?.(seed + 1, count);
    }
    // Avertissements de Python (nom de variable qui masque une fonction de Jinja) et éléments employés
    // (leur style entre dans la page) : portés par le tableau, pour que l’aperçu les retrouve dans son
    // cache ; JSON.stringify les ignore, et la page ne les reçoit pas.
    draws.warnings = [...warnings];
    draws.elements = [...elements].sort();
    return draws;
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    choiceOrder,
    computeDraws,
    drawSpec,
    loadWidgets,
    pythonModules,
    widgetResources
  });
})();
