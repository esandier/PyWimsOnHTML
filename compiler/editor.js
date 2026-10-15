// Atelier du compilateur (SPECIFICATION.md, § 11.10) : l’éditeur de la question courante, la question
// entière dans un seul bloc (CodeMirror 5, une coloration par section), validation et enregistrement
// automatique après chaque pause de la frappe, et l’éditeur vide où l’on colle des questions.
// Ce module ne connaît ni le dossier ni l’aperçu : compiler.js lui passe ses fonctions (callbacks) et
// décide de ce que deviennent la liste, l’aperçu et le fichier.
// Script classique (et non module ES), comme les autres scripts du compilateur ; il publie
// window.PyWimsEditor.
window.PyWimsEditor = (() => {
  const { parseQuestionSource, isDelimiter, fieldHeader } = PyWimsCompiler;

  const pythonFields = new Set(["question_setup", "question_check"]);
  const htmlFields = new Set(["question_statement", "question_solution_explanation"]);
  // Pause de la frappe après laquelle la question est validée, prévisualisée et enregistrée.
  const pauseMs = 600;

  // CodeMirror 5, chargé depuis cdnjs à la première ouverture de l’éditeur (version fixée : une mise à jour
  // ne change rien sans qu’on le décide). CodeMirror 6 a été écarté : il demande un outil de
  // construction (bundler). Sans réseau, l’atelier reste utilisable : une simple zone de texte.
  const codeMirrorBase = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/";
  const codeMirrorScripts = [
    "codemirror.min.js", "mode/python/python.min.js", "mode/xml/xml.min.js", "mode/javascript/javascript.min.js",
    "mode/css/css.min.js", "mode/htmlmixed/htmlmixed.min.js", "addon/mode/overlay.min.js",
    "addon/edit/matchbrackets.min.js", "addon/fold/foldcode.min.js", "addon/fold/foldgutter.min.js",
    "addon/display/placeholder.min.js"
  ];
  const codeMirrorStyles = ["codemirror.min.css", "addon/fold/foldgutter.min.css"];
  let codeMirrorLoading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Échec du chargement de ${src}`));
      document.head.append(script);
    });
  }

  // Charge CodeMirror une seule fois ; null s’il n’a pas pu l’être.
  function loadCodeMirror() {
    codeMirrorLoading ??= (async () => {
      for (const name of codeMirrorStyles) {
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = codeMirrorBase + name;
        document.head.append(style);
      }
      // Les modes et modules dépendent du cœur, et htmlmixed des trois autres : chargement dans l’ordre.
      for (const name of codeMirrorScripts) {
        await loadScript(codeMirrorBase + name);
      }
      defineModes(window.CodeMirror);
      return window.CodeMirror;
    })().catch(() => null);
    return codeMirrorLoading;
  }

  function defineModes(CodeMirror) {
    // Énoncé et explication : HTML, avec en couleur les balises {% … %}, les variables {{ … }} et les
    // formules ($…$, $$…$$, \( … \), \[ … \]). Une variable dans une formule reste une variable. Une
    // formule peut s’étendre sur plusieurs lignes ; une balise, non.
    const closing = { "$$": "$$", "$": "$", "\\(": "\\)", "\\[": "\\]" };
    CodeMirror.defineMode("pwq-html", config => CodeMirror.overlayMode(CodeMirror.getMode(config, "htmlmixed"), {
      startState: () => ({ math: null }),
      copyState: state => ({ math: state.math }),
      token(stream, state) {
        if (stream.match(/^\{\{.*?\}\}/)) return "pwq-variable";
        if (!state.math && stream.match(/^\{%.*?%\}/)) return "pwq-tag";
        if (state.math) {
          if (stream.match(state.math)) {
            state.math = null;
          } else if (!stream.match(/^\\./)) {
            stream.next();
          }
          return "pwq-math";
        }
        // « \$ » est un dollar écrit, pas une formule.
        if (stream.match("\\$")) return null;
        for (const opening of ["$$", "$", "\\(", "\\["]) {
          if (stream.match(opening)) {
            state.math = closing[opening];
            return "pwq-math";
          }
        }
        if (!stream.eatWhile(/[^{$\\]/)) stream.next();
        return null;
      }
    }));

    // Fichier .pwq entier : les lignes « % » et « % question_… » sont des intertitres, et chaque section
    // est colorée selon son champ (Python ou HTML) ; les autres (titre, mots-clés…) restent en texte.
    CodeMirror.defineMode("pwq", config => {
      const inner = name => (pythonFields.has(name) ? CodeMirror.getMode(config, "python")
        : htmlFields.has(name) ? CodeMirror.getMode(config, "pwq-html") : null);
      return {
        startState: () => ({ mode: null, state: null }),
        copyState: ({ mode, state }) => ({ mode, state: mode ? CodeMirror.copyState(mode, state) : null }),
        token(stream, state) {
          if (stream.sol()) {
            const header = fieldHeader(stream.string);
            if (header || isDelimiter(stream.string)) {
              stream.skipToEnd();
              if (header) {
                state.mode = inner(header);
                state.state = state.mode ? CodeMirror.startState(state.mode) : null;
              }
              return header ? "pwq-header" : "pwq-delimiter";
            }
          }
          if (!state.mode) {
            stream.skipToEnd();
            return null;
          }
          return state.mode.token(stream, state.state);
        },
        blankLine: state => state.mode?.blankLine?.(state.state),
        indent: (state, textAfter, line) => (state.mode?.indent
          ? state.mode.indent(state.state, textAfter, line)
          : CodeMirror.Pass),
        innerMode: state => ({ state: state.state, mode: state.mode })
      };
    });

    // Repli d’une section : de son intertitre « % question_… » jusqu’à la ligne qui précède le « % »
    // suivant (ou la fin du fichier).
    CodeMirror.registerHelper("fold", "pwq", (cm, start) => {
      if (!fieldHeader(cm.getLine(start.line))) return undefined;
      let end = start.line + 2;
      while (end < cm.lineCount() && !isDelimiter(cm.getLine(end))) end += 1;
      end -= 1;
      if (end <= start.line) return undefined;
      return { from: CodeMirror.Pos(start.line, cm.getLine(start.line).length), to: CodeMirror.Pos(end, cm.getLine(end).length) };
    });
  }

  // Ligne du fichier où se trouve une erreur, ou null : « pgcd.pwq:12 : … » (erreur de format),
  // « « question_setup », ligne 5 » (erreur Python, ligne comptée dans le champ), ou la ligne qui
  // contient la balise {% … %} citée (erreur de balise, qui ne donne pas de ligne).
  function errorLine(message, text) {
    const fileLine = message.match(/\.pwq:(\d+) :/);
    if (fileLine) return Number(fileLine[1]);
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const fieldLine = message.match(/«\s*(question_[a-z_]+)\s*»[^]*?ligne (\d+)/);
    if (fieldLine) {
      const header = lines.findIndex(line => fieldHeader(line) === fieldLine[1]);
      return header < 0 ? null : header + 2 + Number(fieldLine[2]);
    }
    const tag = message.match(/\{%.*?%\}/);
    const index = tag ? lines.findIndex(line => line.includes(tag[0])) : -1;
    return index < 0 ? null : index + 1;
  }

  // L’éditeur de la question courante (§ 11.10). Un seul éditeur, et un document par question ouverte
  // pendant la visite : chacune garde son historique d’annulation (Ctrl+Z) quand on passe à une autre.
  // Sans CodeMirror (pas de réseau), une simple zone de texte, sans historique propre à chaque question.
  // root : le panneau de l’éditeur. Fonctions de compiler.js :
  //   onChange(question, { text, fields, error }) après une pause de la frappe ;
  //   onSave(question, text) → { saved, message, reload } ;
  //   onPaste(text) → message d’erreur, ou null si le texte collé a donné des questions.
  async function create(root, { onChange, onSave, onPaste }) {
    const CodeMirror = await loadCodeMirror();
    const code = document.createElement("div");
    code.className = "editor-code";
    const notice = document.createElement("p");
    notice.className = "editor-notice";
    notice.hidden = true;
    const footer = document.createElement("div");
    footer.className = "editor-footer";
    const problems = document.createElement("div");
    problems.className = "editor-problems";
    problems.setAttribute("aria-live", "polite");
    const saveState = document.createElement("span");
    saveState.className = "editor-save-state";
    saveState.setAttribute("role", "status");
    footer.append(problems, saveState);
    if (!CodeMirror) {
      const note = document.createElement("span");
      note.className = "editor-note";
      note.textContent = "Éditeur simple : la coloration n’a pas pu être chargée.";
      footer.append(note);
    }
    root.append(notice, code, footer);

    // État de chaque question passée par l’éditeur : document, fins de ligne, pause et écriture en cours,
    // erreurs affichées.
    const states = new Map();
    let current = null;
    // « paste » : l’éditeur vide où l’on colle ; sinon l’état de la question montrée, ou null.
    let mode = null;
    let pasteDoc = null;

    let editor;
    let plain;
    if (CodeMirror) {
      editor = CodeMirror(code, {
        value: "",
        mode: "pwq",
        lineNumbers: true,
        lineWrapping: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        foldGutter: true,
        foldOptions: { rangeFinder: CodeMirror.fold.pwq, widget: " … " },
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        // Tab indente de quatre espaces, ou indente les lignes choisies ; Maj+Tab désindente.
        extraKeys: {
          Tab: cm => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ")),
          "Shift-Tab": "indentLess"
        }
      });
      editor.on("changes", (_editor, changes) => {
        // setValue (fichier relu sur le disque) et swapDoc ne sont pas une frappe de l’auteur.
        if (changes.every(change => change.origin === "setValue")) return;
        if (mode === "paste") {
          pasted(changes.some(change => change.origin === "paste"));
        } else if (current) {
          changed(current);
        }
      });
    } else {
      plain = document.createElement("textarea");
      plain.className = "editor-plain";
      plain.spellcheck = false;
      plain.addEventListener("input", event => {
        if (mode === "paste") {
          pasted(event.inputType === "insertFromPaste");
        } else if (current) {
          changed(current);
        }
      });
      code.append(plain);
    }

    const value = () => (editor ? editor.getValue() : plain.value);
    // Texte de la question, avec les fins de ligne de son fichier : CodeMirror ne connaît que LF, et un
    // fichier CRLF (Windows), ouvert sans être modifié, paraissait changé et était réécrit aussitôt.
    const textOf = state => (state.crlf ? value().replace(/\r?\n/g, "\r\n") : value());

    function goToLine(line) {
      if (editor) {
        editor.focus();
        editor.setCursor({ line: line - 1, ch: 0 });
        editor.scrollIntoView({ line: line - 1, ch: 0 }, 80);
      } else {
        const offset = plain.value.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
        plain.focus();
        plain.setSelectionRange(offset, offset);
      }
    }

    // Ligne d’état : erreur de format et erreur de l’aperçu, chacune avec son lien « ligne n ».
    function renderProblems(state) {
      problems.replaceChildren();
      if (!state || state !== current) return;
      const text = value();
      for (const message of [state.formatError, state.previewError].filter(Boolean)) {
        const item = document.createElement("p");
        item.className = "editor-problem";
        const line = errorLine(message, text);
        if (line) {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "editor-line-link";
          link.textContent = `ligne ${line}`;
          link.title = "Aller à la ligne";
          link.addEventListener("click", () => goToLine(line));
          item.append(link, " ");
        }
        item.append(message);
        problems.append(item);
      }
    }

    function showSaveState(text, className = "") {
      saveState.textContent = text;
      saveState.className = `editor-save-state ${className}`.trim();
    }

    // Après une pause : validation, aperçu (par onChange), puis enregistrement. La question peut ne plus
    // être celle de l’éditeur (on a changé de question entre-temps) : son texte vient alors de son
    // document, gardé à part.
    async function settle(state) {
      clearTimeout(state.timer);
      state.timer = 0;
      const shown = state === current;
      const raw = shown ? null : (state.doc ? state.doc.getValue() : state.text);
      const text = shown ? textOf(state) : (state.crlf ? raw.replace(/\r?\n/g, "\r\n") : raw);
      let fields = null;
      state.formatError = null;
      try {
        fields = parseQuestionSource(text, state.question.path);
        const tagErrors = PyWimsTemplate.validateTemplate(fields.question_statement);
        if (tagErrors.length) {
          state.formatError = tagErrors.join(" ; ");
          fields = null;
        }
      } catch (error) {
        state.formatError = error.message;
      }
      renderProblems(state);
      onChange(state.question, { text, fields, error: state.formatError });
      // Une erreur n’empêche pas l’enregistrement : le fichier reste celui qu’on voit (§ 11.10).
      if (text === state.question.source) {
        if (state === current) showSaveState("Enregistré");
        return;
      }
      if (state === current) showSaveState("Enregistrement…");
      state.saving = onSave(state.question, text);
      const { saved, message, reload } = await state.saving;
      state.saving = null;
      // L’auteur a préféré la version du disque : l’éditeur la reprend.
      if (reload !== undefined) {
        setText(state, reload);
        await settle(state);
        return;
      }
      if (state === current) {
        showSaveState(saved ? "Enregistré" : (message ?? "Non enregistré"), saved ? "" : "error");
      }
    }

    function changed(state) {
      showSaveState("Modifié");
      clearTimeout(state.timer);
      state.timer = setTimeout(() => settle(state), pauseMs);
    }

    // Remplace le texte d’une question (fichier relu sur le disque), sans que ce soit une frappe.
    function setText(state, text) {
      state.crlf = /\r\n/.test(text);
      if (state.doc) {
        state.doc.setValue(text.replace(/\r\n/g, "\n"));
      } else {
        state.text = text;
        if (state === current) plain.value = text;
      }
    }

    // Termine ce qui attend pour la question montrée : pause de la frappe, écriture.
    async function flush() {
      if (current?.timer) await settle(current);
      if (current?.saving) await current.saving;
    }

    function showNotice(text) {
      notice.textContent = text ?? "";
      notice.hidden = !text;
      code.hidden = Boolean(text);
      footer.hidden = Boolean(text);
    }

    // Montre une question dans l’éditeur ; null : aucune. readOnly : la raison pour laquelle elle ne
    // s’édite pas (archive .pwqa), dite à la place de l’éditeur.
    async function show(question, { readOnly = null } = {}) {
      await flush();
      mode = null;
      if (plain && current) current.text = plain.value;
      if (!question || readOnly) {
        current = null;
        showNotice(readOnly ?? "Choisissez une question dans la liste.");
        renderProblems(null);
        return;
      }
      showNotice(null);
      let state = states.get(question);
      if (!state) {
        state = { question, crlf: /\r\n/.test(question.text), timer: 0, saving: null, formatError: null, previewError: null };
        if (CodeMirror) {
          state.doc = CodeMirror.Doc(question.text.replace(/\r\n/g, "\n"), "pwq");
        } else {
          state.text = question.text;
        }
        states.set(question, state);
      }
      current = state;
      if (editor) {
        editor.setOption("placeholder", "");
        editor.swapDoc(state.doc);
        editor.refresh();
      } else {
        plain.placeholder = "";
        plain.value = state.text;
      }
      showSaveState(state.timer ? "Modifié" : "Enregistré");
      renderProblems(state);
      if (!state.validated) {
        state.validated = true;
        settle(state);
      }
    }

    // L’éditeur vide où l’on colle le code d’une ou plusieurs questions (§ 11.10).
    async function showPaste() {
      await flush();
      if (plain && current) current.text = plain.value;
      current = null;
      mode = "paste";
      showNotice(null);
      renderProblems(null);
      showSaveState("");
      const prompt = "Collez ici le code d’une ou plusieurs questions (Ctrl+V)";
      if (editor) {
        pasteDoc = CodeMirror.Doc("", "pwq");
        editor.swapDoc(pasteDoc);
        editor.setOption("placeholder", prompt);
        editor.refresh();
        editor.focus();
      } else {
        plain.value = "";
        plain.placeholder = prompt;
        plain.focus();
      }
    }

    // Texte collé : traité aussitôt ; une frappe, après une pause.
    let pasteTimer = 0;
    function pasted(isPaste) {
      clearTimeout(pasteTimer);
      const handle = async () => {
        const message = await onPaste(value());
        if (message && mode === "paste") {
          problems.replaceChildren(Object.assign(document.createElement("p"), { className: "editor-problem", textContent: message }));
        }
      };
      if (isPaste) handle(); else pasteTimer = setTimeout(handle, pauseMs);
    }

    return {
      show,
      showPaste,
      flush,
      refresh: () => editor?.refresh(),
      // Questions dont une modification attend la fin de la pause ou de l’écriture.
      pending: () => [...states.values()].filter(state => state.timer || state.saving).map(state => state.question),
      // Autre dossier : tout ce qui attend est enregistré, puis l’éditeur oublie ses questions.
      reset: async () => {
        for (const state of states.values()) {
          if (state.timer) await settle(state);
          if (state.saving) await state.saving;
        }
        states.clear();
        current = null;
        mode = null;
        showNotice("Choisissez une question dans la liste.");
      },
      knows: question => states.has(question),
      // Question supprimée du dossier : sa pause en cours est abandonnée (l’enregistrement recréerait le
      // fichier), l’écriture déjà lancée attendue, puis l’éditeur l’oublie.
      forget: async question => {
        const state = states.get(question);
        if (!state) return;
        clearTimeout(state.timer);
        state.timer = 0;
        if (state.saving) await state.saving;
        states.delete(question);
        if (state === current) {
          current = null;
          showNotice("Choisissez une question dans la liste.");
          renderProblems(null);
        }
      },
      // Fichier relu sur le disque (« Relire ») : l’éditeur reprend la nouvelle version.
      reload: (question, text) => {
        const state = states.get(question);
        if (!state || state.timer || state.saving) return;
        setText(state, text);
        if (state === current) settle(state);
      },
      // Erreur du tirage de l’aperçu (Python), affichée sous l’éditeur ; null l’efface.
      showPreviewError: (question, message) => {
        const state = states.get(question);
        if (!state || state.previewError === message) return;
        state.previewError = message;
        renderProblems(state);
      }
    };
  }

  return Object.freeze({ create, loadCodeMirror });
})();
