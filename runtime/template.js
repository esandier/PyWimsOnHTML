// Outils communs au compilateur et à la question générée : échappement, barème d’AMC, affichage de
// l’énoncé rendu. L’énoncé et l’explication sont des modèles Jinja, rendus par Python à la compilation
// (SPECIFICATION.md, § 2.10) ; Jinja y appelle les widgets, qui notent les champs de chaque tirage
// (§ 2.11, compiler/pywims_draws.py). Ce fichier ne lit donc jamais l’énoncé écrit par l’auteur.
window.PyWimsTemplate = (() => {
  // Marque d’un champ dans l’énoncé rendu (« \u0001nom\u0001 ») : le widget la renvoie à Jinja, et la
  // page la remplace par le champ, dont le HTML dépend de la page (identifiants q2-…, état).
  // Un caractère de contrôle ne peut venir ni de l’auteur ni d’une formule.
  const markPattern = /\u0001([^\u0001]+)\u0001/gu;
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

  // Directives de barème d’AMC prises en charge. « e » est acceptée sans effet, car une saisie
  // incohérente est impossible ici : un barème d’AMC se recopie ainsi tel quel.
  const scoringDirectives = new Set(["b", "m", "d", "p", "P", "mz", "haut", "MAX", "v", "e"]);
  // Directives d’AMC connues mais non prises en charge : le message le dit, au lieu de « inconnue ».
  const unsupportedScoring = /^(formula|auto|SUF|allowempty|(set|setglobal|default|requires)\..+)$/;
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

  // Saisie d’un champ à choix telle que « question_check » la reçoit (SPECIFICATION.md, § 10.3) : avec
  // count, un bloc des choix n’affiche qu’une partie de ses choix, et ranks donne le rang dans le bloc
  // de chaque choix affiché. Un indice, une liste d’indices ou null ; sans ranks, la saisie telle quelle.
  function blockRank(value, ranks) {
    if (!ranks || value === null || value === undefined) return value;
    return Array.isArray(value) ? value.map(index => ranks[index]).sort((a, b) => a - b) : ranks[value];
  }

  return Object.freeze({
    isName,
    pythonName,
    rawInputAttributes,
    escapeHtml,
    limitedHtml,
    parseScoring,
    scoreChoice,
    checkIdPrefix,
    blockRank,
    renderStatement
  });
})();
