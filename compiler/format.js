// Format .pwq : analyse d’un fichier d’exercice et types de ses champs de réponse.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
  // « apres » est facultatif : sans lui, la correction par défaut compare chaque saisie à sa
  // solution (SPECIFICATION.md, § 2.6).
  const requiredFields = ["title", "keywords", "layout", "avant", "enonce"];
  const knownFields = new Set([...requiredFields, "apres", "tirages"]);
  // Analyse les champs délimités par « % » et signale les erreurs avec leur emplacement.
  function parseExerciseSource(source, path = "exercise.pwq") {
    const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    const fields = {};
    let index = 0;

    // Le séparateur ne contient que le signe « % », avec d’éventuels espaces.
    function isDelimiter(line) {
      return line.trim() === "%";
    }

    if (!isDelimiter(lines[index])) {
      throw new Error(`${path} : le fichier doit commencer par une ligne délimiteur « % ».`);
    }
    index += 1;

    while (index < lines.length) {
      const header = lines[index].trim().match(/^%\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!header) {
        throw new Error(`${path}:${index + 1} : en-tête de champ attendu, par exemple « % title ».`);
      }

      const name = header[1];
      if (!knownFields.has(name)) {
        throw new Error(`${path}:${index + 1} : champ inconnu « ${name} ».`);
      }
      if (Object.hasOwn(fields, name)) {
        throw new Error(`${path}:${index + 1} : le champ « ${name} » est présent plusieurs fois.`);
      }
      index += 1;

      if (index >= lines.length || !isDelimiter(lines[index])) {
        throw new Error(`${path}:${index + 1} : ligne délimiteur « % » attendue sous l’en-tête « ${name} ».`);
      }
      index += 1;

      const content = [];
      while (index < lines.length && !isDelimiter(lines[index])) {
        content.push(lines[index]);
        index += 1;
      }
      fields[name] = content.join("\n").trimEnd();

      if (index < lines.length) {
        index += 1;
      }
      if (lines.slice(index).every(line => line.trim() === "")) {
        break;
      }
    }

    for (const required of requiredFields) {
      if (!fields[required]?.trim()) {
        throw new Error(`${path} : le champ obligatoire « ${required} » est absent ou vide.`);
      }
    }
    // Nombre de tirages, facultatif : un entier de 1 à 200 (au-delà, le fichier s’alourdit et la
    // compilation s’allonge sans profit pour l’élève).
    if (fields.tirages !== undefined) {
      const count = fields.tirages.trim();
      if (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 200) {
        throw new Error(`${path} : le champ « tirages » doit être un entier de 1 à 200, et non « ${count} ».`);
      }
      fields.tirages = count;
    }
    // Un « apres » vide équivaut à son absence : la question se corrige alors sans Python.
    if (fields.apres !== undefined && !fields.apres.trim()) {
      delete fields.apres;
    }
    return fields;
  }

  // Noms des types de champs de réponse, tels que la liste les affiche.
  const fieldKindNames = {
    input_text: "texte",
    input_math: "formule",
    input_matrix: "matrice",
    input_vmatrix: "matrice redimensionnable",
    input_radio: "choix unique",
    input_checkbox: "choix multiple"
  };

  // Types de champs de réponse d’un énoncé, dans l’ordre et sans répétition : « choix unique ».
  function fieldKindsLabel(enonce) {
    const kinds = [...new Set(PyWimsTemplate.parseTags(enonce).map(tag => fieldKindNames[tag.type] ?? tag.type))];
    return kinds.length ? kinds.join(" · ") : "aucun champ de réponse";
  }

  // Avertissements sur l’écriture de l’énoncé, qui n’empêchent pas la compilation (SPECIFICATION.md,
  // § 2.4). Trois accolades de suite, comme dans \frac{{{n}}}{{{m}}}, fonctionnent (la variable est
  // {{n}}, entourée des accolades de TeX), mais se relisent mal et se corrigent avec erreur.
  function templateWarnings(fields) {
    const warnings = [];
    if (/\{\{\{|\}\}\}/.test(fields.enonce)) {
      warnings.push("L’énoncé contient trois accolades de suite (par exemple \\frac{{{n}}}{{{m}}}) : " +
        "écrivez \\frac{ {{n}} }{ {{m}} }, plus lisible, avec le même résultat.");
    }
    return warnings;
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    parseExerciseSource,
    fieldKindsLabel,
    templateWarnings
  });
})();
