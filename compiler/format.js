// Format .pwq : analyse d’un fichier de question et types de ses champs de réponse.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
  // « question_check » est facultatif : sans lui, la correction par défaut compare chaque saisie à sa
  // solution (SPECIFICATION.md, § 2.6). Les noms sont ceux du § 2.1 ; les anciens noms de PyWims
  // (avant, enonce, apres…) sont refusés comme tout champ inconnu.
  const requiredFields = ["question_title", "question_keywords", "question_layout", "question_setup", "question_statement"];
  const knownFields = new Set([...requiredFields, "question_solution_explanation", "question_check", "question_draws"]);

  // Fichiers de question d’un dossier : un .pwq, ou une archive qui contient un .pwq et ses images
  // (SPECIFICATION.md, § 2.7). « .pwqa » dit que c’est une question ; un « .zip » quelconque peut
  // être autre chose, et n’est une question que s’il contient un .pwq.
  const isQuestionFile = name => /\.(pwq|pwqa|zip)$/i.test(name);
  const isArchive = name => /\.(pwqa|zip)$/i.test(name);

  // Formats d’image admis, d’après l’extension : ceux que tous les navigateurs affichent.
  const imageTypes = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp"
  };
  // Au-delà, une image alourdit trop la page : un avertissement le dit (§ 2.7).
  const largeImageBytes = 300 * 1024;
  // Attribut src d’une balise <img>, entre guillemets doubles ou simples.
  const imageSourcePattern = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gis;
  // Une adresse complète (https:, data:…) ou absolue n’est pas une image de l’archive.
  const isRelativeSource = source => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(source.trim());

  // Nom d’image tel que l’écrit l’auteur : « ./figure.png » ou « mon%20image.png » désignent aussi
  // un fichier de l’archive.
  function imageName(source) {
    let name = source.trim().replace(/^\.\//, "");
    try {
      name = decodeURIComponent(name);
    } catch {
      // Un « % » isolé : le nom est gardé tel quel.
    }
    return name;
  }

  // Octets en base64, par tranches : String.fromCharCode(...bytes) dépasse la pile pour une image.
  function base64(bytes) {
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    }
    return btoa(binary);
  }

  // Texte du .pwq d’une archive, ses images intégrées (adresses data:), ou null pour un .zip qui ne
  // contient pas de .pwq. files : [{ name, bytes }] (readZip). Les images sont intégrées dans le
  // texte même du .pwq : le reste du compilateur ne voit qu’un .pwq ordinaire, et « Relire »
  // compare ce texte, donc voit aussi une image modifiée.
  function archiveQuestionSource(files, path) {
    // Fichiers ajoutés par macOS, sans rapport avec la question.
    let entries = files.filter(({ name }) => !name.startsWith("__MACOSX/") && !name.split("/").at(-1).startsWith("."));
    const sources = entries.filter(({ name }) => /\.pwq$/i.test(name));
    if (!sources.length) {
      if (/\.zip$/i.test(path)) return null;
      throw new Error(`${path} : l’archive ne contient pas de fichier .pwq.`);
    }
    if (sources.length > 1) {
      throw new Error(`${path} : l’archive contient plusieurs fichiers .pwq (${sources.map(({ name }) => name).join(", ")}) ; une archive ne contient qu’une question.`);
    }
    // Un dossier compressé tout entier : son dossier, s’il est seul, est ignoré.
    const folders = new Set(entries.map(({ name }) => (name.includes("/") ? name.split("/")[0] : "")));
    if (folders.size === 1 && !folders.has("")) {
      const prefix = `${[...folders][0]}/`;
      entries = entries.map(entry => ({ ...entry, name: entry.name.slice(prefix.length) }));
    }
    const nested = entries.find(({ name }) => name.includes("/"));
    if (nested) {
      throw new Error(`${path} : « ${nested.name} » est dans un sous-dossier de l’archive ; le .pwq et ses images doivent être à sa racine.`);
    }
    const images = new Map();
    let text = "";
    for (const { name, bytes } of entries) {
      const type = imageTypes[name.split(".").at(-1).toLowerCase()];
      if (/\.pwq$/i.test(name)) {
        text = new TextDecoder().decode(bytes);
      } else if (type) {
        images.set(name, `data:${type};base64,${base64(bytes)}`);
      }
    }
    return text.replace(imageSourcePattern, (match, start, quote, source) => {
      const image = isRelativeSource(source) && images.get(imageName(source));
      return image ? `${start}${quote}${image}${quote}` : match;
    });
  }

  // Images relatives qui restent dans l’énoncé ou l’explication : absentes de l’archive, ou d’un
  // .pwq seul, qui n’en a pas. Une page compilée est autonome : elle ne pourrait pas les afficher.
  function missingImageError(fields, path) {
    for (const name of ["question_statement", "question_solution_explanation"]) {
      for (const [, , , source] of (fields[name] ?? "").matchAll(imageSourcePattern)) {
        if (!isRelativeSource(source)) continue;
        const formats = Object.keys(imageTypes).join(", ");
        return isArchive(path)
          ? `${path} : l’image « ${imageName(source)} » n’est pas dans l’archive (formats admis : ${formats}).`
          : `${path} : l’image « ${imageName(source)} » ne peut pas être intégrée à un .pwq seul ; mettez le .pwq et ses images dans une archive .pwqa.`;
      }
    }
    return null;
  }
  // Analyse les champs délimités par « % » et signale les erreurs avec leur emplacement.
  function parseQuestionSource(source, path = "question.pwq") {
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
        throw new Error(`${path}:${index + 1} : en-tête de champ attendu, par exemple « % question_title ».`);
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
    if (fields.question_draws !== undefined) {
      const count = fields.question_draws.trim();
      if (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 200) {
        throw new Error(`${path} : le champ « question_draws » doit être un entier de 1 à 200, et non « ${count} ».`);
      }
      fields.question_draws = count;
    }
    // Un « question_check » vide équivaut à son absence : la question se corrige alors sans Python.
    if (fields.question_check !== undefined && !fields.question_check.trim()) {
      delete fields.question_check;
    }
    const imageError = missingImageError(fields, path);
    if (imageError) {
      throw new Error(imageError);
    }
    // L’explication s’écrit comme l’énoncé, mais sans champ de réponse : elle s’affiche avec la
    // solution, quand les champs sont déjà remplis.
    if (fields.question_solution_explanation !== undefined) {
      if (!fields.question_solution_explanation.trim()) {
        delete fields.question_solution_explanation;
      } else if (PyWimsTemplate.parseTags(fields.question_solution_explanation).length) {
        throw new Error(`${path} : le champ « question_solution_explanation » ne peut pas contenir de champ de réponse {% … %}.`);
      }
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
  function fieldKindsLabel(question_statement) {
    const kinds = [...new Set(PyWimsTemplate.parseTags(question_statement).map(tag => fieldKindNames[tag.type] ?? tag.type))];
    return kinds.length ? kinds.join(" · ") : "aucun champ de réponse";
  }

  // Avertissements sur l’écriture de l’énoncé, qui n’empêchent pas la compilation (SPECIFICATION.md,
  // § 2.4). Trois accolades de suite, comme dans \frac{{{n}}}{{{m}}}, fonctionnent (la variable est
  // {{n}}, entourée des accolades de TeX), mais se relisent mal et se corrigent avec erreur.
  function templateWarnings(fields) {
    const warnings = [];
    if (/\{\{\{|\}\}\}/.test(fields.question_statement)) {
      warnings.push("L’énoncé contient trois accolades de suite (par exemple \\frac{{{n}}}{{{m}}}) : " +
        "écrivez \\frac{ {{n}} }{ {{m}} }, plus lisible, avec le même résultat.");
    }
    // Une image intégrée (data:) pèse les trois quarts de son écriture en base64.
    for (const name of ["question_statement", "question_solution_explanation"]) {
      for (const [, , , source] of (fields[name] ?? "").matchAll(imageSourcePattern)) {
        const data = source.match(/^data:[^,]*;base64,(.*)$/s);
        const bytes = data ? Math.floor(data[1].length * 3 / 4) : 0;
        if (bytes > largeImageBytes) {
          warnings.push(`Une image pèse ${Math.round(bytes / 1024)} Ko : la page s’alourdit d’autant ; réduisez-la (300 Ko au plus).`);
        }
      }
    }
    return warnings;
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    parseQuestionSource,
    isQuestionFile,
    archiveQuestionSource,
    fieldKindsLabel,
    templateWarnings
  });
})();
