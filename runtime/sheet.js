// La feuille : crée une question par section, et gère ce qui les réunit (progression et sa
// mémoire, note indicative, aide, célébration, redimensionnement). Une question seule n’a ni
// progression ni note indicative. Script classique, après fields.js et question.js.
(() => {
  const { reduceMotion } = PyWimsFields;
  const { Question, formatScore } = PyWimsQuestion;
  const singleQuestion = document.body.dataset.sheet === "single";

  // Progression de la feuille : part des questions réussies, chaque question ayant le même poids.
  const completionButton = document.getElementById("pw-completion");
  const completionValue = document.getElementById("pw-completion-value");
  const completionLabel = document.getElementById("pw-completion-label");
  const completionTip = document.getElementById("pw-completion-tip");
  const progressFill = document.getElementById("pw-progress-fill");
  let shownPercent = 0;
  let celebrated = false;

  // Met à jour le pourcentage, l’étiquette et la barre de progression de l’activité ; à 100 %,
  // la feuille est fêtée une seule fois.
  function updateProgress(questions) {
    const done = questions.filter(question => question.succeeded).length;
    const percent = Math.round(done * 100 / questions.length);
    progressFill.style.width = `${percent}%`;
    completionLabel.textContent = `${done} / ${questions.length} réussie${done > 1 ? "s" : ""}`;
    completionButton.setAttribute("aria-label", `${percent} % de réussite : ${completionLabel.textContent}`);
    // Le pourcentage affiché rejoint la nouvelle valeur en ralentissant.
    const start = shownPercent;
    const startTime = performance.now();
    const step = now => {
      const t = reduceMotion ? 1 : Math.min(1, (now - startTime) / 800);
      shownPercent = Math.round(start + (percent - start) * (1 - (1 - t) ** 3));
      completionValue.textContent = `${shownPercent} %`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (percent === 100 && !celebrated) {
      celebrated = true;
      celebrate();
    }
  }

  // Feuille terminée : message bref et, sauf mouvements réduits, confettis aux couleurs de la charte.
  function celebrate() {
    const toast = document.createElement("div");
    toast.className = "pw-toast";
    toast.setAttribute("role", "status");
    toast.textContent = "Feuille terminée — bravo !";
    document.body.append(toast);
    const toastDuration = 2600;
    if (reduceMotion) {
      setTimeout(() => toast.remove(), toastDuration);
      return;
    }
    toast.animate(
      [
        { opacity: 0, transform: "translate(-50%, -10px)" },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.15 },
        { opacity: 1, transform: "translate(-50%, 0)", offset: 0.85 },
        { opacity: 0, transform: "translate(-50%, -10px)" }
      ],
      { duration: toastDuration }
    ).finished.then(() => toast.remove());
    const style = getComputedStyle(document.documentElement);
    const colors = ["--pw-brand-primary", "--pw-brand-navy", "--pw-correct-text", "--pw-brand-tertiary"]
      .map(name => style.getPropertyValue(name).trim());
    for (let i = 0; i < 70; i += 1) {
      const piece = document.createElement("span");
      piece.className = "pw-confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[i % colors.length];
      document.body.append(piece);
      const drift = (Math.random() - 0.5) * 200;
      piece.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${drift}px, 105vh) rotate(${Math.random() * 900}deg)`, opacity: 0.9 }
        ],
        { duration: 1800 + Math.random() * 1600, delay: Math.random() * 400, easing: "cubic-bezier(.2,.6,.4,1)" }
      ).finished.then(() => piece.remove());
    }
  }

  // Aide : le bouton « ? » ouvre la fenêtre ; un clic hors de son contenu la referme.
  const help = document.getElementById("pw-help");
  document.getElementById("pw-help-button").addEventListener("click", () => help.showModal());
  help.addEventListener("click", event => {
    if (event.target === help) help.close();
  });

  // Bulle du pourcentage : le survol et le focus clavier l’affichent (CSS) ; le toucher l’ouvre et la ferme.
  function toggleCompletionTip(open) {
    completionTip.classList.toggle("is-open", open);
    completionButton.setAttribute("aria-expanded", String(open));
  }
  completionButton.addEventListener("click", event => {
    event.stopPropagation();
    toggleCompletionTip(!completionTip.classList.contains("is-open"));
  });
  document.addEventListener("click", () => toggleCompletionTip(false));

  // Note indicative de l’activité : somme des dernières notes des questions, sur la somme de leurs
  // maxima. Elle n’existe que si toutes les questions ont un barème (voir plus bas).
  const scoreTotal = document.getElementById("pw-score-total");
  const scoreTotalValue = document.getElementById("pw-score-total-value");
  const scoreTotalLabel = document.getElementById("pw-score-total-label");

  // Affiche dans l’en-tête la note indicative de l’activité.
  function updateScoreTotal(questions) {
    if (!questions.every(question => question.scoring)) {
      return;
    }
    const sum = questions.reduce((total, question) => total + question.score, 0);
    const max = questions.reduce((total, question) => total + question.scoreMax, 0);
    scoreTotalValue.textContent = `${formatScore(sum)} / ${formatScore(max)}`;
    scoreTotalLabel.textContent = "note indicative";
    scoreTotal.title = `Note indicative : ${scoreTotalValue.textContent}`;
    scoreTotal.hidden = false;
  }

  // Chaque section de la feuille devient une question indépendante ; seule une activité a une
  // progression et une note indicative.
  // Mémoire de la progression d’une activité (SPECIFICATION.md, § 5.3) : les numéros des questions
  // réussies, gardés par le navigateur sous l’empreinte de la feuille. Plusieurs feuilles d’un même
  // site partagent le stockage : l’empreinte les distingue, et une feuille modifiée en change.
  // Le stockage peut être indisponible (navigation privée, réglages) : la feuille marche sans.
  const sheetId = document.body.dataset.sheetId;
  const progressKey = !singleQuestion && sheetId ? `pywims-progression:${sheetId}` : null;

  function loadProgress() {
    if (!progressKey) return [];
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) ?? "null");
      return Array.isArray(saved?.reussies) ? saved.reussies : [];
    } catch {
      return [];
    }
  }

  function saveProgress(questions) {
    if (!progressKey) return;
    try {
      const succeeded = questions.filter(question => question.succeeded).map(question => question.index + 1);
      localStorage.setItem(progressKey, JSON.stringify({ reussies: succeeded }));
    } catch {
      // Sans stockage, la progression est seulement perdue à la fermeture de la page.
    }
  }

  // Bouton ↺ « Réinitialiser la feuille », dans l’en-tête : efface la mémoire, après confirmation, puis recharge
  // la feuille pour repartir de questions vierges.
  document.getElementById("pw-restart")?.addEventListener("click", () => {
    if (!confirm("Effacer vos réussites et recommencer la feuille ?")) return;
    try {
      localStorage.removeItem(progressKey);
    } catch {
      // Rien à effacer si le stockage est indisponible.
    }
    location.reload();
  });

  // Zone de retour commune du style compact (SPECIFICATION.md, § 5.7) : sur grand écran, le dernier
  // retour affiché est déplacé de sa question dans la marge droite, puis ramené au retour suivant.
  // Un seul nœud, jamais copié : une copie doublerait les formules composées (identifiants SVG
  // compris) et les annonces aux lecteurs d’écran. Le retour est composé dans sa question, puis
  // déplacé ; la zone, et non le retour, annonce donc le contenu (aria-live), car un retour
  // composé dans l’emplacement invisible de la question n’est pas annoncé.
  // Sur écran étroit, rien n’est déplacé : le retour reste sous sa question.
  const compactStyle = !singleQuestion && document.body.dataset.style === "compact";
  const wideScreen = matchMedia("(min-width: 1001px)");
  const sections = [...document.querySelectorAll(".pw-question")];
  let zone = null;
  let zoneEmpty = null;
  let zoneQuestion = null;
  let lastFeedbackQuestion = null;
  const zoneWatch = compactStyle && new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target === zoneQuestion?.section) zone.classList.toggle("is-stale", !entry.isIntersecting);
    }
  });

  if (compactStyle) {
    zone = document.createElement("aside");
    zone.className = "pw-feedback-zone";
    zone.setAttribute("aria-label", "Commentaires et solutions");
    zone.setAttribute("aria-live", "polite");
    // La zone occupe la marge sur toute la hauteur des questions, et y reste collée au défilement.
    zone.style.gridRow = `1 / span ${sections.length}`;
    zoneEmpty = document.createElement("p");
    zoneEmpty.className = "pw-feedback-zone-empty";
    zoneEmpty.textContent = "Les commentaires et les solutions s’affichent ici.";
    zone.append(zoneEmpty);
    document.querySelector(".pw-sheet").prepend(zone);
  }

  // Ramène dans sa question le retour affiché par la zone, qui redevient vide.
  function releaseZone() {
    if (!zoneQuestion) return;
    zoneWatch.unobserve(zoneQuestion.section);
    zoneQuestion.slotElement.append(zoneQuestion.feedbackElement);
    zoneQuestion.layoutFeedback();
    zoneQuestion = null;
    zone.classList.remove("is-stale");
    zone.replaceChildren(zoneEmpty);
  }

  // Affiche dans la zone le retour d’une question, sous « Question n », qui ramène à la question.
  function showInZone(question) {
    releaseZone();
    zoneQuestion = question;
    const link = document.createElement("button");
    link.type = "button";
    link.className = "pw-feedback-zone-link";
    link.textContent = `Question ${question.index + 1}`;
    link.addEventListener("click", () =>
      question.section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
    zone.replaceChildren(link, question.feedbackElement);
    zoneWatch.observe(question.section);
  }

  function onFeedback(question, shown) {
    if (shown) {
      lastFeedbackQuestion = question;
      if (wideScreen.matches) showInZone(question);
    } else {
      if (lastFeedbackQuestion === question) lastFeedbackQuestion = null;
      if (zoneQuestion === question) releaseZone();
    }
  }

  // Passage d’un écran étroit à un grand écran (fenêtre élargie, rotation) : le dernier retour encore
  // affiché passe dans la zone, ou en revient.
  if (compactStyle) {
    wideScreen.addEventListener("change", () => {
      if (!wideScreen.matches) {
        releaseZone();
      } else if (lastFeedbackQuestion) {
        showInZone(lastFeedbackQuestion);
      }
    });
  }

  const questions = sections.map(
    (section, index) => new Question(section, index, {
      onSuccess: singleQuestion ? null : () => {
        updateProgress(questions);
        saveProgress(questions);
      },
      onScoreChange: singleQuestion ? null : () => updateScoreTotal(questions),
      onFeedback: compactStyle ? onFeedback : null
    })
  );
  // La note est réservée à une activité dont toutes les questions ont un barème, un « examen blanc »
  // (SPECIFICATION.md, § 10.5) : une note sur une partie des questions seulement se lisait comme une
  // évaluation de toute l’activité. Sinon, aucune question n’est notée : il reste la progression.
  if (!singleQuestion && questions.every(question => question.scoring)) {
    document.body.dataset.scored = "true";
  } else {
    questions.forEach(question => question.dropScoring());
  }
  if (!singleQuestion) {
    // Réussites retrouvées : le ✓ revient, tout le reste repart vierge. Une feuille retrouvée
    // terminée ne relance pas les confettis.
    const restored = new Set(loadProgress());
    for (const question of questions) {
      if (restored.has(question.index + 1)) question.markSucceeded({ restored: true });
    }
    celebrated = questions.every(question => question.succeeded);
    updateProgress(questions);
    updateScoreTotal(questions);
  }
  // Redimensionnement : le navigateur envoie l’événement à chaque pixel pendant qu’on tire la fenêtre,
  // et chaque mise en colonnes des choix mesure la page. On regroupe donc les mesures à l’image
  // suivante, une fois par image au plus.
  // Seul un changement de largeur fait oublier les hauteurs gardées des énoncés : sur téléphone, la
  // barre d’adresse qui apparaît ou disparaît au défilement change la hauteur de la fenêtre, et
  // les cartes ne doivent pas rétrécir pendant qu’on fait défiler la feuille.
  let resizeFrame = 0;
  let lastWidth = innerWidth;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const widthChanged = innerWidth !== lastWidth;
      lastWidth = innerWidth;
      questions.forEach(question => {
        if (widthChanged) question.forgetPromptHeight();
        PyWimsWidgets.fitChoiceColumns?.(question.promptElement);
        question.fitWideFormulas();
        question.layoutFeedback();
      });
    });
  });
  for (const question of questions) {
    question.start();
  }
})();
