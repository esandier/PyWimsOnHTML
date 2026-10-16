// Assemblage du fichier généré : ressources du projet, sections des questions, mise en page,
// empreinte d’une activité et nom du fichier.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
  // Protège les données de la question avant de les insérer dans le HTML généré.
  const { escapeHtml } = PyWimsTemplate;

  // Intègre les champs comme texte lisible dans des blocs dédiés au runtime.
  function renderQuestionData(fields) {
    return Object.entries(fields)
      .map(([name, value]) => `<pre data-field="${escapeHtml(name)}">${escapeHtml(value)}</pre>`)
      .join("\n");
  }

  // Intègre les tirages précalculés : compressés (gzip, en base64), ou en JSON pour un export « pour
  // navigateur ancien » et pour l’aperçu (SPECIFICATION.md, § 5.10). Le JSON n’échappe que « & » et
  // « < », seuls signes qu’un texte d’élément doit protéger : avec les guillemets écrits « &quot; »,
  // il pesait 30 % de plus.
  function renderDrawData(draws, compressed = null) {
    if (compressed !== null) {
      return `<pre data-draws="gzip">${compressed}</pre>`;
    }
    return `<pre data-draws>${JSON.stringify(draws).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`;
  }

  // Tirages compressés pour la page : le JSON des tirages d’une question se répète presque mot pour mot
  // d’un tirage à l’autre, et la compression le divise par quinze environ. La page le décompresse avec
  // DecompressionStream, qui demande Chrome 80, Firefox 113 ou Safari 16.4. Base64 : les octets compressés
  // ne sont pas du texte, et un texte d’élément ne peut porter que du texte.
  async function compressDraws(draws) {
    const stream = new Blob([JSON.stringify(draws)]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    // Par tranches : String.fromCharCode reçoit chaque octet en argument, et leur nombre est limité.
    for (let start = 0; start < bytes.length; start += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    }
    return btoa(binary);
  }

  // Commentaires retirés du code intégré à la page : ils documentent les fichiers du projet, que personne
  // ne lit dans la page, et pesaient plus d’un tiers d’une question seule. En JavaScript et en Python, seules
  // les lignes entières de commentaire partent : un « // » en fin de ligne peut être dans une chaîne
  // (« https:// »). Aucune ligne de ces fichiers ne commence par « // » ou « # » au milieu d’une chaîne.
  // Le contenu des questions n’est jamais touché.
  const stripComments = {
    html: text => text.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, ""),
    css: text => text.replace(/[ \t]*\/\*[\s\S]*?\*\/[ \t]*\n?/g, ""),
    js: text => text.replace(/^[ \t]*\/\/.*\n/gm, ""),
    python: text => text.replace(/^[ \t]*#.*\n/gm, "")
  };

  // Fichiers du projet intégrés au HTML généré ; les widgets facultatifs ne sont lus que s’ils servent.
  const resourcePaths = {
    layout: "layouts/standard.html",
    template: "runtime/template.js",
    correction: "runtime/correction.js",
    brandCss: "css/brand.css",
    questionCss: "css/question.css",
    textWidget: "widgets/input-text.js",
    mathWidget: "widgets/input-math.js",
    matrixWidget: "widgets/input-matrix.js",
    choiceWidget: "widgets/input-choice.js",
    fields: "runtime/fields.js",
    question: "runtime/question.js",
    sheet: "runtime/sheet.js",
    python: "runtime/python.js",
    pywims: "runtime/pywims.py",
    pythonWorker: "runtime/python-worker.js",
    // Liaison au LMS d’un paquet SCORM (§ 5.9) : neededResources ne la demande jamais ; l’atelier
    // l’ajoute aux ressources pour un export SCORM, et sa présence suffit à l’intégrer.
    scorm: "runtime/scorm.js"
  };

  // Indique quels fichiers du projet utilisent une question ou l’ensemble des questions d’une feuille.
  function neededResources(fieldsOrList) {
    const list = Array.isArray(fieldsOrList) ? fieldsOrList : [fieldsOrList];
    const tagTypes = new Set(list.flatMap(fields => [...PyWimsTemplate.tagTypes(fields.question_statement)]));
    // Le module pywims et le script du Worker ne servent qu’aux questions qui ont un « question_check » : elles
    // seules chargent Python.
    const usesPython = list.some(fields => fields.question_check !== undefined);
    return Object.keys(resourcePaths).filter(key =>
      key !== "scorm" &&
      (!["pywims", "pythonWorker"].includes(key) || usesPython) &&
      (key !== "mathWidget" || tagTypes.has("input_math")) &&
      (key !== "matrixWidget" || tagTypes.has("input_matrix") || tagTypes.has("input_vmatrix")) &&
      (key !== "choiceWidget" || ["input_radio", "input_checkbox", "input_select"].some(type => tagTypes.has(type)))
    );
  }

  // Section d’une question : ses champs et ses tirages en texte échappé, lus par question.js.
  function renderQuestionSection(fields, draws, index, compressedDraws = null) {
    if (!Array.isArray(draws) || !draws.length) {
      throw new Error(`Les tirages de « ${fields.question_title} » doivent être calculés avant l’assemblage.`);
    }
    if (fields.question_layout !== "STD") {
      throw new Error(`La mise en page « ${fields.question_layout} » n’est pas prise en charge par ce prototype.`);
    }
    const tagErrors = PyWimsTemplate.validateTemplate(fields.question_statement);
    if (tagErrors.length) {
      throw new Error(tagErrors.join(" ; "));
    }
    // Seule une question qui a un « question_check » a besoin de Python ; les autres se corrigent par
    // comparaison avec leur solution (SPECIFICATION.md, § 2.6) et ne chargent pas Pyodide.
    const python = fields.question_check === undefined ? "false" : "true";
    // Sans Python, « question_setup » ne servirait à rien : il ne sert qu’à rejouer un tirage. Les tirages
    // suffisent, et la page s’allège d’autant (un quart d’une activité de QCM à variantes).
    // Le modèle de l’explication ne sert jamais à la page : chaque tirage porte son explication rendue.
    const { question_setup, question_solution_explanation, ...kept } = fields;
    return `<section class="pw-question" id="q${index + 1}" data-python="${python}">
<div class="pw-question-data" hidden>
${renderQuestionData(fields.question_check === undefined ? kept : { question_setup, ...kept })}
${renderDrawData(draws, compressedDraws)}
</div>
</section>`;
  }

  // Assemble une question seule ; c’est une feuille d’une question avec la mise en page « question seule ».
  // compressedDraws : ses tirages compressés (compressDraws), absents pour l’aperçu et un ancien navigateur.
  function assembleQuestion(fields, draws, resources, compressedDraws = null) {
    return assembleSheet({ title: fields.question_title, kind: "single", questions: [{ fields, draws, compressedDraws }] },
      resources);
  }

  // Assemble une activité : une feuille de plusieurs questions dans un seul document.
  // compact : style « feuille de TD » choisi par l’auteur (SPECIFICATION.md, § 5.7).
  function assembleActivity(title, questions, resources, { compact = false } = {}) {
    if (!title.trim() || questions.length < 2) {
      throw new Error("Une activité exige un titre et au moins deux questions.");
    }
    return assembleSheet({ title, kind: "activity", questions, compact }, resources);
  }

  // Emplacements de la mise en page qui reçoivent du code tel quel, avec la balise qui l’entoure.
  const inlinedPlaceholders = {
    CSS: "style", TEMPLATE: "script", CORRECTION: "script", WIDGETS: "script", MATHLIVE_LOADER: "script",
    PYWIMS: "script", PYTHON_WORKER: "script", PYTHON_RUNTIME: "script", FIELDS: "script", QUESTION: "script",
    SCORM: "script", SHEET: "script"
  };

  // Refuse un code qui fermerait sa balise : « </script » au milieu d’un script termine la balise
  // pour le navigateur, et la page générée serait cassée sans aucun message. On n’échappe pas en
  // « <\/script » : le module pywims, intégré tel quel dans un bloc non exécuté, serait modifié.
  function checkInlined(name, code) {
    const element = inlinedPlaceholders[name];
    if (element && new RegExp(`</${element}`, "i").test(code)) {
      throw new Error(`Le code intégré en @@${name}@@ contient « </${element} », qui fermerait la balise <${element}> de la page générée : coupez la chaîne, par exemple '</' + '${element}'.`);
    }
    return code;
  }

  // Empreinte d’une activité, pour la mémoire de la progression (SPECIFICATION.md, § 5.3) : hachage
  // cyrb53 (53 bits, rapide, sans dépendance) du titre et du contenu de toutes les questions. Ce
  // n’est pas une protection : il suffit que deux feuilles différentes n’aient pas la même empreinte,
  // et qu’une feuille modifiée en change.
  function sheetFingerprint(title, questions) {
    const text = JSON.stringify([title, questions.map(({ fields, draws }) => [fields, draws])]);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // MathJax compose les formules TeX des énoncés et des retours, en SVG : un tracé vectoriel, net à
  // toute taille d’écran et à tout zoom. Script bloquant dans <head> : il est prêt quand les
  // questions s’affichent. String.raw garde les barres obliques telles quelles (« \\( » en JS).
  const mathJaxMarkup = String.raw`<script>
    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
        processEscapes: true
      },
      startup: { typeset: false }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>`;

  // Une feuille a besoin de MathJax (≈ 600 Ko) si elle peut afficher une formule (SPECIFICATION.md,
  // § 5.1) : un délimiteur dans l’énoncé ou l’explication rendus d’un tirage, ou dans l’un de ses choix,
  // ou une question qui a un « question_check », dont le retour, calculé chez l’élève, peut en contenir
  // une. Un « $ » qui n’ouvre pas de formule fait seulement charger MathJax pour rien.
  function needsMathJax(questions) {
    const delimiter = /\$|\\\(|\\\[/;
    return questions.some(({ fields, draws }) =>
      fields.question_check !== undefined ||
      draws.some(draw => [
        draw.statement ?? "",
        draw.explanation ?? "",
        ...Object.values(draw.choices ?? {}).flat()
      ].some(text => delimiter.test(String(text)))));
  }

  // Assemble le HTML autonome à partir des textes des fichiers du projet, sans accès au disque.
  // Pyodide, MathJax et MathLive sont chargés une seule fois, quel que soit le nombre de questions.
  function assembleSheet({ title, kind, questions, compact = false }, resources) {
    const sections = questions.map(({ fields, draws, compressedDraws }, index) =>
      renderQuestionSection(fields, draws, index, compressedDraws));
    const { html, css, js, python } = stripComments;
    const usesMathWidget = neededResources(questions.map(({ fields }) => fields)).includes("mathWidget");
    const replacements = {
      MATHJAX: needsMathJax(questions) ? mathJaxMarkup : "",
      TITLE: escapeHtml(title),
      SHEET_KIND: kind,
      // Seule une activité garde sa progression : une question seule n’a pas d’empreinte.
      SHEET_ID: kind === "activity" ? ` data-sheet-id="${sheetFingerprint(title, questions)}"` : "",
      // Le style compact ne concerne que les activités ; une question seule garde le style habituel.
      SHEET_STYLE: compact && kind === "activity" ? ' data-style="compact"' : "",
      CSS: css(`${resources.brandCss}\n${resources.questionCss}`),
      TEMPLATE: js(resources.template),
      CORRECTION: js(resources.correction),
      WIDGETS: js([resources.textWidget, resources.mathWidget, resources.matrixWidget, resources.choiceWidget]
        .filter(Boolean).join("\n")),
      MATHLIVE_LOADER: usesMathWidget
        ? `// Charge le clavier mathématique uniquement pour les questions qui en ont besoin.
window.pyWimsMathLiveReady = new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = "https://unpkg.com/mathlive@0.111.0";
  script.onload = resolve;
  script.onerror = () => reject(new Error("Échec du chargement de MathLive."));
  document.head.append(script);
});`
        : "window.pyWimsMathLiveReady = Promise.resolve();",
      // Vide si aucune question n’a d’« question_check » : Python n’est alors jamais chargé.
      PYWIMS: python(resources.pywims ?? ""),
      PYTHON_WORKER: js(resources.pythonWorker ?? ""),
      PYTHON_RUNTIME: js(resources.python),
      QUESTIONS: sections.join("\n"),
      FIELDS: js(resources.fields),
      QUESTION: js(resources.question),
      // Vide hors paquet SCORM : la feuille garde alors sa mémoire dans le navigateur.
      SCORM: js(resources.scorm ?? ""),
      SHEET: js(resources.sheet)
    };
    // Les commentaires de la mise en page partent avant son remplissage : le contenu des questions, que
    // l’auteur a écrit, n’est jamais touché.
    return html(resources.layout).replace(/@@([A-Z_]+)@@/g, (_match, name) => {
      if (!Object.hasOwn(replacements, name)) {
        throw new Error(`Emplacement réservé inconnu dans la mise en page : ${name}`);
      }
      return checkInlined(name, replacements[name]);
    });
  }

  // Crée un nom de fichier sûr en conservant les lettres Unicode, dont les accents français.
  function createQuestionFilename(title) {
    const slug = title
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `${slug || "question"}.html`;
  }

  // Fichiers d’un paquet SCORM 1.2 (SPECIFICATION.md, § 5.9) : la feuille, assemblée avec la liaison au
  // LMS (ressource scorm), et le manifeste qui la déclare comme unique SCO. Sans « masteryscore » : le
  // LMS en déduirait « passed » ou « failed » d’après la note, alors que la feuille dit elle-même
  // « completed » à 100 %. Les schémas XSD de l’ADL ne sont pas joints : Moodle ne les demande pas.
  function scormPackageEntries(html, title) {
    const xmlTitle = escapeHtml(title);
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="pwoh-${Date.now().toString(36)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="organisation">
    <organization identifier="organisation">
      <title>${xmlTitle}</title>
      <item identifier="feuille" identifierref="ressource">
        <title>${xmlTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="ressource" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`;
    return [{ name: "imsmanifest.xml", content: manifest }, { name: "index.html", content: html }];
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    renderDrawData,
    compressDraws,
    resourcePaths,
    neededResources,
    assembleQuestion,
    assembleActivity,
    renderQuestionData,
    createQuestionFilename,
    scormPackageEntries
  });
})();
