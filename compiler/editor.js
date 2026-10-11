// Atelier du compilateur (SPECIFICATION.md, § 11.10) : un onglet par question ouverte dans le panneau de
// gauche, la question entière dans un seul éditeur (CodeMirror 5, une coloration par section),
// validation et enregistrement automatique après chaque pause de la frappe.
// Ce module ne connaît ni le dossier ni l’aperçu : compiler.js lui passe ses fonctions (callbacks) et
// décide de ce que deviennent la liste, l’aperçu et le fichier.
// Script classique (et non module ES), comme les autres scripts du compilateur ; il publie
// window.PyWimsEditor.
window.PyWimsEditor = (() => {
  const { parseQuestionSource, splitQuestionSource } = PyWimsCompiler;

  const pythonFields = new Set(["question_setup", "question_check"]);
  const htmlFields = new Set(["question_statement", "question_solution_explanation"]);
  // Pause de la frappe après laquelle la question est validée, prévisualisée et enregistrée.
  const pauseMs = 600;

  // CodeMirror 5, chargé depuis cdnjs à l’ouverture du premier onglet (version fixée : une mise à jour
  // ne change rien sans qu’on le décide). CodeMirror 6 a été écarté : il demande un outil de
  // construction (bundler). Sans réseau, l’atelier reste utilisable : une simple zone de texte.
  const codeMirrorBase = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/";
  const codeMirrorScripts = [
    "codemirror.min.js", "mode/python/python.min.js", "mode/xml/xml.min.js", "mode/javascript/javascript.min.js",
    "mode/css/css.min.js", "mode/htmlmixed/htmlmixed.min.js", "addon/mode/overlay.min.js",
    "addon/edit/matchbrackets.min.js", "addon/fold/foldcode.min.js", "addon/fold/foldgutter.min.js"
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
            const line = stream.string.trim();
            const header = line.match(/^%\s+([A-Za-z_][A-Za-z0-9_]*)$/);
            if (line === "%" || header) {
              stream.skipToEnd();
              if (header) {
                state.mode = inner(header[1]);
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
      if (!/^%\s+[A-Za-z_]/.test(cm.getLine(start.line).trim())) return undefined;
      let end = start.line + 2;
      while (end < cm.lineCount() && cm.getLine(end).trim() !== "%") end += 1;
      end -= 1;
      if (end <= start.line) return undefined;
      return { from: CodeMirror.Pos(start.line, cm.getLine(start.line).length), to: CodeMirror.Pos(end, cm.getLine(end).length) };
    });
  }

  // Éditeur de la question : CodeMirror s’il est chargé, une zone de texte sinon. Renvoie
  // { getValue, setValue, refresh, focus, goToLine }.
  function createCodeArea(parent, value, onChange, CodeMirror) {
    if (CodeMirror) {
      const editor = CodeMirror(parent, {
        value,
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
      editor.on("change", (_editor, change) => {
        // setValue (fichier relu sur le disque) n’est pas une frappe de l’auteur.
        if (change.origin !== "setValue") onChange();
      });
      return {
        getValue: () => editor.getValue(),
        setValue: text => editor.setValue(text),
        refresh: () => editor.refresh(),
        focus: () => editor.focus(),
        goToLine: line => {
          editor.focus();
          editor.setCursor({ line: line - 1, ch: 0 });
          editor.scrollIntoView({ line: line - 1, ch: 0 }, 80);
        }
      };
    }
    const area = document.createElement("textarea");
    area.className = "editor-plain";
    area.value = value;
    area.spellcheck = false;
    area.addEventListener("input", onChange);
    parent.append(area);
    return {
      getValue: () => area.value,
      setValue: text => { area.value = text; },
      refresh: () => {},
      focus: () => area.focus(),
      goToLine: line => {
        const offset = area.value.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
        area.focus();
        area.setSelectionRange(offset, offset);
      }
    };
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
      const header = lines.findIndex(line => line.trim().match(/^%\s+([A-Za-z_]+)$/)?.[1] === fieldLine[1]);
      return header < 0 ? null : header + 2 + Number(fieldLine[2]);
    }
    const tag = message.match(/\{%.*?%\}/);
    const index = tag ? lines.findIndex(line => line.includes(tag[0])) : -1;
    return index < 0 ? null : index + 1;
  }

  function create({ tabBar, listTab, listView, editorView, onActivate, onChange, onSave, onClose }) {
    const tabs = [];
    let active = null;

    const label = question => question.fields?.question_title || question.path.split("/").pop();

    // Onglet « Liste » ou onglet d’une question ; null : « Liste ».
    function activate(tab) {
      active = tab;
      listTab.setAttribute("aria-selected", String(!tab));
      listView.hidden = Boolean(tab);
      editorView.hidden = !tab;
      for (const other of tabs) {
        other.button.setAttribute("aria-selected", String(other === tab));
        other.panel.hidden = other !== tab;
      }
      tab?.area.refresh();
      onActivate(tab?.question ?? null);
    }

    function renderTabBar() {
      tabBar.hidden = !tabs.length;
      for (const tab of tabs) {
        tab.title.textContent = label(tab.question);
        tab.button.title = tab.question.path;
      }
    }

    // Ligne d’état : erreur de format et erreur de l’aperçu, chacune avec son lien « ligne n ».
    function renderProblems(tab) {
      tab.problems.replaceChildren();
      const text = tab.area.getValue();
      for (const message of [tab.formatError, tab.previewError].filter(Boolean)) {
        const item = document.createElement("p");
        item.className = "editor-problem";
        const line = errorLine(message, text);
        if (line) {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "editor-line-link";
          link.textContent = `ligne ${line}`;
          link.title = "Aller à la ligne";
          link.addEventListener("click", () => tab.area.goToLine(line));
          item.append(link, " ");
        }
        item.append(message);
        tab.problems.append(item);
      }
    }

    function showSaveState(tab, text, className = "") {
      tab.saveState.textContent = text;
      tab.saveState.className = `editor-save-state ${className}`.trim();
    }

    // Après une pause : validation, aperçu (par onChange), puis enregistrement.
    async function settle(tab) {
      clearTimeout(tab.timer);
      tab.timer = 0;
      // CodeMirror ne connaît que les fins de ligne LF : celles du fichier (CRLF sous Windows) sont
      // rétablies. Sans cela, ouvrir un fichier CRLF le faisait paraître modifié, et l’atelier le
      // réécrivait aussitôt, fins de ligne changées.
      const text = tab.crlf ? tab.area.getValue().replace(/\r?\n/g, "\r\n") : tab.area.getValue();
      let fields = null;
      tab.formatError = null;
      try {
        fields = parseQuestionSource(text, tab.question.path);
        const tagErrors = PyWimsTemplate.validateTemplate(fields.question_statement);
        if (tagErrors.length) {
          tab.formatError = tagErrors.join(" ; ");
          fields = null;
        }
      } catch (error) {
        tab.formatError = error.message;
      }
      renderProblems(tab);
      onChange(tab.question, { text, fields, error: tab.formatError });
      renderTabBar();
      // Une erreur n’empêche pas l’enregistrement : le fichier reste celui qu’on voit (§ 11.10).
      if (text === tab.question.source) {
        showSaveState(tab, "Enregistré");
        return;
      }
      showSaveState(tab, "Enregistrement…");
      tab.saving = onSave(tab.question, text);
      const { saved, message, reload } = await tab.saving;
      tab.saving = null;
      // L’auteur a préféré la version du disque : l’atelier la reprend.
      if (reload !== undefined) {
        tab.area.setValue(reload);
        await settle(tab);
        return;
      }
      if (saved) {
        showSaveState(tab, "Enregistré");
      } else {
        showSaveState(tab, message ?? "Non enregistré", "error");
      }
    }

    function changed(tab) {
      showSaveState(tab, "Modifié");
      clearTimeout(tab.timer);
      tab.timer = setTimeout(() => settle(tab), pauseMs);
    }

    // Ferme un onglet, après avoir enregistré ce qui ne l’est pas encore.
    async function closeTab(tab) {
      if (tab.timer) await settle(tab);
      if (tab.saving) await tab.saving;
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      tabs.splice(index, 1);
      tab.button.remove();
      tab.panel.remove();
      onClose(tab.question);
      renderTabBar();
      // Comme dans un navigateur : l’onglet voisin prend la place, « Liste » s’il n’en reste pas.
      if (active === tab) activate(tabs[Math.min(index, tabs.length - 1)] ?? null);
    }

    // Ouvre l’onglet d’une question (question.text : son texte), ou revient à son onglet.
    async function open(question) {
      const existing = tabs.find(tab => tab.question === question);
      if (existing) {
        activate(existing);
        return;
      }
      const CodeMirror = await loadCodeMirror();
      const tab = { question, timer: 0, saving: null, formatError: null, previewError: null, crlf: /\r\n/.test(question.text) };

      tab.button = document.createElement("div");
      tab.button.className = "left-tab";
      tab.button.setAttribute("role", "tab");
      tab.title = document.createElement("button");
      tab.title.type = "button";
      tab.title.className = "left-tab-title";
      tab.title.addEventListener("click", () => activate(tab));
      const close = document.createElement("button");
      close.type = "button";
      close.className = "left-tab-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "Fermer l’onglet");
      close.addEventListener("click", () => closeTab(tab));
      tab.button.append(tab.title, close);
      tabBar.append(tab.button);

      tab.panel = document.createElement("div");
      tab.panel.className = "editor-tab";
      const code = document.createElement("div");
      code.className = "editor-code";
      const footer = document.createElement("div");
      footer.className = "editor-footer";
      tab.problems = document.createElement("div");
      tab.problems.className = "editor-problems";
      tab.problems.setAttribute("aria-live", "polite");
      tab.saveState = document.createElement("span");
      tab.saveState.className = "editor-save-state";
      tab.saveState.setAttribute("role", "status");
      footer.append(tab.problems, tab.saveState);
      if (!CodeMirror) {
        const note = document.createElement("span");
        note.className = "editor-note";
        note.textContent = "Éditeur simple : la coloration n’a pas pu être chargée.";
        footer.append(note);
      }
      tab.panel.append(code, footer);
      editorView.append(tab.panel);
      tab.area = createCodeArea(code, question.text, () => changed(tab), CodeMirror);
      tabs.push(tab);
      renderTabBar();
      activate(tab);
      showSaveState(tab, "Enregistré");
      settle(tab);
    }

    listTab.addEventListener("click", () => activate(null));

    const tabOf = question => tabs.find(tab => tab.question === question);
    return {
      open,
      activate: question => activate(tabOf(question) ?? null),
      isOpen: question => Boolean(tabOf(question)),
      openQuestions: () => tabs.map(tab => tab.question),
      // Questions dont une modification attend la fin de la pause ou de l’écriture.
      pending: () => tabs.filter(tab => tab.timer || tab.saving).map(tab => tab.question),
      // Enregistre tout ce qui attend, puis ferme les onglets (autre dossier).
      closeAll: async () => {
        for (const tab of [...tabs]) await closeTab(tab);
      },
      // Fichier relu sur le disque (« Relire ») : l’onglet montre la nouvelle version.
      reload: (question, text) => {
        const tab = tabOf(question);
        if (!tab || tab.timer || tab.saving) return;
        tab.area.setValue(text);
        settle(tab);
      },
      // Erreur du tirage de l’aperçu (Python), affichée sous l’éditeur ; null l’efface.
      showPreviewError: (question, message) => {
        const tab = tabOf(question);
        if (!tab || tab.previewError === message) return;
        tab.previewError = message;
        renderProblems(tab);
      },
      refreshLabels: renderTabBar
    };
  }

  return Object.freeze({ create, loadCodeMirror });
})();
