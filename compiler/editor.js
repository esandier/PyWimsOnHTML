// Éditeur de questions du compilateur (SPECIFICATION.md, § 11.10) : un onglet par question ouverte dans
// le panneau de gauche, un sous-onglet par champ, coloration par CodeMirror 5, validation à la frappe.
// Ce module ne connaît ni le dossier ni l’aperçu : compiler.js lui passe ses fonctions (callbacks) et
// décide de ce que deviennent la liste, l’aperçu et l’enregistrement.
// Script classique (et non module ES), comme les autres scripts du compilateur ; il publie
// window.PyWimsEditor.
window.PyWimsEditor = (() => {
  const { parseQuestionSource, splitQuestionSource, serializeQuestionSource, fieldAtLine } = PyWimsCompiler;

  // Champs de l’en-tête, montrés en formulaire ; question_layout, toujours « STD », n’est pas montré.
  const headerFields = ["question_title", "question_keywords", "question_layout", "question_draws"];
  // Champs facultatifs qu’un « + » ajoute quand ils manquent.
  const optionalFields = ["question_check", "question_solution_explanation"];
  const pythonFields = new Set(["question_setup", "question_check"]);
  // Nom d’un sous-onglet : le champ sans « question_ », commun à tous (« statement », « check »).
  const shortName = name => name.replace(/^question_/, "");
  const validationDelayMs = 400;

  // CodeMirror 5, chargé depuis cdnjs à l’ouverture du premier onglet (version fixée : une mise à jour
  // ne change rien sans qu’on le décide). CodeMirror 6 a été écarté : il demande un outil de
  // construction (bundler). Sans réseau, l’éditeur reste utilisable : de simples zones de texte.
  const codeMirrorBase = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/";
  const codeMirrorScripts = [
    "codemirror.min.js", "mode/python/python.min.js", "mode/xml/xml.min.js", "mode/javascript/javascript.min.js",
    "mode/css/css.min.js", "mode/htmlmixed/htmlmixed.min.js", "addon/mode/overlay.min.js", "addon/edit/matchbrackets.min.js"
  ];
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
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = `${codeMirrorBase}codemirror.min.css`;
      document.head.append(style);
      // Les modes dépendent du cœur, et htmlmixed des trois autres : chargement dans l’ordre.
      for (const name of codeMirrorScripts) {
        await loadScript(codeMirrorBase + name);
      }
      definePwqMode(window.CodeMirror);
      return window.CodeMirror;
    })().catch(() => null);
    return codeMirrorLoading;
  }

  // Mode de l’énoncé et de l’explication : HTML, avec en couleur les balises {% … %}, les variables
  // {{ … }} et les formules ($…$, $$…$$, \( … \), \[ … \]). Une variable dans une formule reste une
  // variable. Une formule peut s’étendre sur plusieurs lignes ; une balise, non.
  function definePwqMode(CodeMirror) {
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
  }

  // Zone de code d’un champ : CodeMirror s’il est chargé, une zone de texte sinon. Renvoie
  // { getValue, refresh, focus }.
  function createCodeArea(parent, value, mode, onChange, CodeMirror) {
    if (CodeMirror) {
      const editor = CodeMirror(parent, {
        value,
        mode,
        lineNumbers: true,
        lineWrapping: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        // Tab indente de quatre espaces, ou indente les lignes choisies ; Maj+Tab désindente.
        extraKeys: {
          Tab: cm => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ")),
          "Shift-Tab": "indentLess"
        }
      });
      editor.on("change", () => onChange(editor.getValue()));
      return { getValue: () => editor.getValue(), refresh: () => editor.refresh(), focus: () => editor.focus() };
    }
    const area = document.createElement("textarea");
    area.className = "editor-plain";
    area.value = value;
    area.spellcheck = false;
    area.addEventListener("input", () => onChange(area.value));
    parent.append(area);
    return { getValue: () => area.value, refresh: () => {}, focus: () => area.focus() };
  }

  // Champ d’une erreur de validation, pour marquer son sous-onglet : le nom cité par le message
  // (« le champ obligatoire « question_setup »… »), ou la ligne « fichier:12 » rattachée à son champ.
  function errorField(message, fields) {
    const named = [...message.matchAll(/«\s*([A-Za-z_][A-Za-z0-9_]*)\s*»/g)]
      .map(match => match[1]).find(name => fields.some(field => field.name === name) || name.startsWith("question_"));
    if (named) return named;
    const line = message.match(/:(\d+) :/);
    return line ? fieldAtLine(fields, Number(line[1])) : null;
  }

  function create({ tabBar, questionsTab, questionsView, editorView, onActivate, onChange, onTry, onSave, onClose }) {
    const tabs = [];
    let active = null;

    const label = question => question.fields?.question_title || question.path.split("/").pop();
    const tabText = tab => tab.raw ?? serializeQuestionSource(tab.split.fields, tab.split);
    const fieldEntry = (tab, name) => tab.split.fields.find(field => field.name === name);

    // Onglet « Liste » ou onglet d’une question ; null : « Liste ».
    function activate(tab) {
      active = tab;
      questionsTab.setAttribute("aria-selected", String(!tab));
      questionsView.hidden = Boolean(tab);
      editorView.hidden = !tab;
      for (const other of tabs) {
        other.button.setAttribute("aria-selected", String(other === tab));
        other.panel.hidden = other !== tab;
      }
      tab?.areas.forEach(area => area.refresh());
      onActivate(tab?.question ?? null);
    }

    function renderTabBar() {
      tabBar.hidden = !tabs.length;
      for (const tab of tabs) {
        tab.title.textContent = label(tab.question);
        tab.button.title = tab.question.path;
        tab.dot.hidden = !tab.dirty;
      }
    }

    // Ligne d’état de l’onglet et marques des sous-onglets.
    function showValidation(tab, error, field) {
      tab.status.textContent = error ?? "";
      tab.status.className = `editor-status${error ? " error" : ""}`;
      for (const [name, button] of tab.subButtons) {
        const isHeader = name === "header" && headerFields.includes(field);
        button.classList.toggle("has-error", Boolean(error) && (name === field || isHeader || (name === "raw" && error)));
      }
    }

    // Valide le texte de l’onglet comme à l’ouverture du dossier : format, puis balises de l’énoncé.
    function validate(tab) {
      clearTimeout(tab.timer);
      // Un fichier entier redevenu découpable retrouve ses sous-onglets.
      if (tab.raw !== null) {
        const split = splitQuestionSource(tab.raw);
        if (split) {
          tab.split = split;
          tab.raw = null;
          renderSubTabs(tab);
        }
      }
      const text = tabText(tab);
      let fields = null;
      let error = null;
      let field = null;
      try {
        fields = parseQuestionSource(text, tab.question.path);
        const tagErrors = PyWimsTemplate.validateTemplate(fields.question_statement);
        if (tagErrors.length) {
          error = tagErrors.join(" ; ");
          field = "question_statement";
        }
      } catch (caught) {
        error = caught.message;
        field = tab.split ? errorField(error, tab.split.fields) : "raw";
      }
      showValidation(tab, error, field);
      onChange(tab.question, { text, fields: error ? null : fields, error, dirty: tab.dirty });
      renderTabBar();
    }

    function changed(tab) {
      tab.dirty = true;
      renderTabBar();
      clearTimeout(tab.timer);
      tab.timer = setTimeout(() => validate(tab), validationDelayMs);
    }

    // Formulaire de l’en-tête : titre, mots-clés, nombre de tirages (vide : 20, le champ est retiré).
    function headerForm(tab) {
      const form = document.createElement("div");
      form.className = "editor-header";
      const rows = [
        ["question_title", "Titre", "text"],
        ["question_keywords", "Mots-clés (séparés par des virgules)", "text"],
        ["question_draws", "Nombre de tirages (vide : 20)", "number"]
      ];
      for (const [name, text, type] of rows) {
        const row = document.createElement("label");
        const input = document.createElement("input");
        input.type = type;
        if (type === "number") {
          input.min = "1";
          input.max = "200";
        }
        input.value = fieldEntry(tab, name)?.content ?? "";
        input.addEventListener("input", () => {
          const entry = fieldEntry(tab, name);
          if (name === "question_draws" && !input.value.trim()) {
            tab.split.fields = tab.split.fields.filter(field => field !== entry);
          } else if (entry) {
            entry.content = input.value;
          } else {
            tab.split.fields.push({ name, content: input.value });
          }
          changed(tab);
        });
        row.append(text, input);
        form.append(row);
      }
      return { element: form, area: { refresh: () => {}, focus: () => form.querySelector("input").focus() } };
    }

    // Sous-onglets : Paramètres, un par champ du fichier (même inconnu), « + » pour un champ facultatif
    // absent ; « Fichier entier » seul si le fichier ne se découpe pas.
    function renderSubTabs(tab, show = null) {
      tab.subBar.replaceChildren();
      tab.subPanels.replaceChildren();
      tab.subButtons = new Map();
      tab.areas = [];
      const subTabs = [];
      if (tab.raw !== null) {
        subTabs.push({ key: "raw", text: "Fichier entier", build: parent => tab.code(parent, tab.raw, null, value => { tab.raw = value; }) });
      } else {
        subTabs.push({ key: "header", text: "Paramètres", build: parent => {
          const { element, area } = headerForm(tab);
          parent.append(element);
          return area;
        } });
        for (const field of tab.split.fields.filter(entry => !headerFields.includes(entry.name))) {
          const mode = pythonFields.has(field.name) ? "python" : "pwq-html";
          subTabs.push({ key: field.name, text: shortName(field.name), build: parent => tab.code(parent, field.content, mode, value => { field.content = value; }) });
        }
      }
      for (const subTab of subTabs) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "editor-subtab";
        button.setAttribute("role", "tab");
        button.textContent = subTab.text;
        const panel = document.createElement("div");
        panel.className = "editor-subpanel";
        panel.hidden = true;
        let area = null;
        const open = () => {
          for (const [, other] of tab.subButtons) other.setAttribute("aria-selected", "false");
          for (const other of tab.subPanels.children) other.hidden = true;
          button.setAttribute("aria-selected", "true");
          panel.hidden = false;
          // La zone est créée à la première ouverture : CodeMirror mesure son cadre, qui doit être visible.
          if (!area) {
            area = subTab.build(panel);
            tab.areas.push(area);
          }
          area.refresh();
          tab.shown = subTab.key;
        };
        button.addEventListener("click", () => {
          open();
          area.focus();
        });
        tab.subButtons.set(subTab.key, button);
        // Un champ facultatif se retire comme il s’ajoute : « × » à côté de son nom, et son « + »
        // revient. Un champ qui a du contenu n’est retiré qu’après confirmation.
        if (optionalFields.includes(subTab.key)) {
          const group = document.createElement("span");
          group.className = "editor-subtab-group";
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "editor-subtab-remove";
          remove.textContent = "×";
          remove.title = `Retirer le champ ${subTab.key}`;
          remove.setAttribute("aria-label", remove.title);
          remove.addEventListener("click", () => {
            const field = fieldEntry(tab, subTab.key);
            if (field?.content.trim() && !confirm(`Retirer le champ ${subTab.key} et son contenu ?`)) return;
            tab.split.fields = tab.split.fields.filter(entry => entry !== field);
            changed(tab);
            renderSubTabs(tab, tab.shown === subTab.key ? "question_statement" : tab.shown);
          });
          group.append(button, remove);
          tab.subBar.append(group);
        } else {
          tab.subBar.append(button);
        }
        tab.subPanels.append(panel);
        subTab.open = open;
      }
      if (tab.raw === null) {
        for (const name of optionalFields.filter(name => !fieldEntry(tab, name))) {
          const add = document.createElement("button");
          add.type = "button";
          add.className = "editor-subtab editor-add";
          add.textContent = `+ ${shortName(name)}`;
          add.title = `Ajouter le champ ${name}`;
          add.addEventListener("click", () => {
            tab.split.fields.push({ name, content: "" });
            changed(tab);
            renderSubTabs(tab, name);
          });
          tab.subBar.append(add);
        }
      }
      const shown = subTabs.find(subTab => subTab.key === (show ?? tab.shown)) ??
        subTabs.find(subTab => subTab.key === "question_statement") ?? subTabs[0];
      shown.open();
    }

    async function save(tab, { close = false } = {}) {
      clearTimeout(tab.timer);
      validate(tab);
      const text = tabText(tab);
      // onSave enregistre et tient la liste à jour ; il renvoie { saved, message, kind }. Le message
      // s’affiche dans la ligne d’état de l’onglet, à côté des boutons : les messages de l’en-tête de
      // la page passaient inaperçus pendant l’édition. La frappe suivante l’efface.
      const { saved, message, kind } = await onSave(tab.question, text);
      if (message) {
        tab.status.textContent = message;
        tab.status.className = `editor-status ${kind}`;
      }
      if (saved) {
        tab.dirty = false;
        renderTabBar();
        if (close) closeTab(tab, { force: true });
      }
    }

    // Ferme un onglet ; s’il a des modifications non enregistrées, demande confirmation.
    function closeTab(tab, { force = false } = {}) {
      if (!force && (tab.dirty || tab.question.isNew) && !confirm(tab.question.isNew
        ? `« ${label(tab.question)} » n’est pas enregistrée : la fermer la retire de la liste. Fermer quand même ?`
        : `Fermer « ${label(tab.question)} » sans enregistrer les modifications ?`)) {
        return false;
      }
      clearTimeout(tab.timer);
      const index = tabs.indexOf(tab);
      tabs.splice(index, 1);
      tab.button.remove();
      tab.panel.remove();
      onClose(tab.question, { discarded: !force && (tab.dirty || tab.question.isNew) });
      renderTabBar();
      // Comme dans un navigateur : l’onglet voisin prend la place, « Liste » s’il n’en reste pas.
      if (active === tab) activate(tabs[Math.min(index, tabs.length - 1)] ?? null);
      return true;
    }

    // Ouvre l’onglet d’une question (question.text : son texte courant), ou revient à son onglet.
    async function open(question) {
      const existing = tabs.find(tab => tab.question === question);
      if (existing) {
        activate(existing);
        return;
      }
      const CodeMirror = await loadCodeMirror();
      const split = splitQuestionSource(question.text);
      const tab = { question, split, raw: split ? null : question.text, dirty: Boolean(question.isNew), timer: 0, shown: null, areas: [] };
      // question_layout vaut toujours « STD » et n’est pas montré : un fichier qui l’oublie le reçoit.
      if (split && !split.fields.some(field => field.name === "question_layout")) {
        const after = split.fields.findIndex(field => field.name === "question_keywords");
        split.fields.splice(after < 0 ? split.fields.length : after + 1, 0, { name: "question_layout", content: "STD" });
        tab.dirty = true;
      }
      tab.code = (parent, value, mode, store) =>
        createCodeArea(parent, value, mode, text => { store(text); changed(tab); }, CodeMirror);

      tab.button = document.createElement("div");
      tab.button.className = "left-tab";
      tab.button.setAttribute("role", "tab");
      tab.title = document.createElement("button");
      tab.title.type = "button";
      tab.title.className = "left-tab-title";
      tab.title.addEventListener("click", () => activate(tab));
      tab.dot = document.createElement("span");
      tab.dot.className = "left-tab-dot";
      tab.dot.textContent = "●";
      tab.dot.title = "Modifications non enregistrées";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "left-tab-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "Fermer l’onglet");
      close.addEventListener("click", () => closeTab(tab));
      tab.button.append(tab.dot, tab.title, close);
      tabBar.append(tab.button);

      tab.panel = document.createElement("div");
      tab.panel.className = "editor-tab";
      tab.subBar = document.createElement("div");
      tab.subBar.className = "editor-subtabs";
      tab.subBar.setAttribute("role", "tablist");
      tab.subPanels = document.createElement("div");
      tab.subPanels.className = "editor-subpanels";
      tab.status = document.createElement("p");
      tab.status.className = "editor-status";
      tab.status.setAttribute("aria-live", "polite");
      const actions = document.createElement("div");
      actions.className = "editor-actions";
      const button = (text, title, action, primary = false) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = primary ? "editor-button is-primary" : "editor-button";
        element.textContent = text;
        element.title = title;
        element.addEventListener("click", action);
        actions.append(element);
      };
      button("Essayer", "Aperçu de cette version, avec un nouveau tirage (Ctrl+Entrée)", () => {
        validate(tab);
        onTry(question);
      });
      button("Enregistrer", "Ctrl+S", () => save(tab), true);
      button("Enregistrer et fermer", "", () => save(tab, { close: true }));
      button("Fermer", "", () => closeTab(tab));
      if (!CodeMirror) {
        const note = document.createElement("span");
        note.className = "editor-note";
        note.textContent = "Éditeur simple : la coloration n’a pas pu être chargée.";
        actions.append(note);
      }
      tab.panel.append(tab.subBar, tab.subPanels, tab.status, actions);
      // Raccourcis, en capture : avant CodeMirror, qui garderait Ctrl+Entrée pour lui.
      tab.panel.addEventListener("keydown", event => {
        if (!(event.ctrlKey || event.metaKey)) return;
        if (event.key === "s" || event.key === "S") {
          event.preventDefault();
          event.stopPropagation();
          save(tab);
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          validate(tab);
          onTry(question);
        }
      }, true);
      editorView.append(tab.panel);
      tabs.push(tab);
      renderSubTabs(tab);
      renderTabBar();
      activate(tab);
      validate(tab);
    }

    questionsTab.addEventListener("click", () => activate(null));

    return {
      open,
      activate: question => activate(tabs.find(tab => tab.question === question) ?? null),
      isOpen: question => tabs.some(tab => tab.question === question),
      // Questions dont l’onglet a des modifications non enregistrées (ou jamais enregistrées).
      unsaved: () => tabs.filter(tab => tab.dirty || tab.question.isNew).map(tab => tab.question),
      openQuestions: () => tabs.map(tab => tab.question),
      closeAll: () => [...tabs].forEach(tab => closeTab(tab, { force: true })),
      refreshLabels: renderTabBar
    };
  }

  return Object.freeze({ create, loadCodeMirror });
})();
