// Liaison SCORM 1.2 d’une feuille exportée en paquet SCORM (SPECIFICATION.md, § 5.9) : la feuille
// transmet au LMS (Moodle) sa seule progression, et le LMS garde ses réussites d’une séance à l’autre.
// Script classique, intégré seulement au paquet SCORM, avant sheet.js qui s’en sert.
//
// Pourquoi SCORM 1.2 et non 2004 : c’est la version que Moodle gère le mieux. Elle n’a pas de champ de
// progression : le pourcentage est transmis comme note sur 100 (cmi.core.score.raw), que Moodle
// reporte dans son carnet de notes, et « completed » à 100 %.
// La note transmise ne baisse jamais (« Recommencer la feuille » n’efface pas une réussite acquise).
// Les réussites (numéros des questions) vont dans cmi.suspend_data : l’élève les retrouve sur un autre
// appareil, ce que le stockage du navigateur ne permet pas.
window.PyWimsScorm = (() => {
  // API SCORM 1.2 : objet « API » d’une fenêtre parente (cadre de Moodle) ou de la fenêtre qui a ouvert
  // celle-ci (fenêtre surgissante). Recherche limitée, comme dans l’exemple de l’ADL : une fenêtre
  // d’un autre site lève une exception à la lecture, et la chaîne ne remonte pas indéfiniment.
  function findApi(start) {
    let win = start;
    for (let depth = 0; win && depth < 10; depth += 1) {
      try {
        if (win.API && typeof win.API.LMSInitialize === "function") return win.API;
      } catch {
        return null;
      }
      if (win.parent === win) break;
      win = win.parent;
    }
    return null;
  }

  // Liaison au LMS, ou null hors d’un LMS (fichier ouvert seul, aperçu) : la feuille garde alors sa
  // mémoire habituelle, dans le navigateur.
  function connect() {
    const api = findApi(window) ?? (window.opener ? findApi(window.opener) : null);
    if (!api) return null;
    // Erreur 101, « déjà initialisé » : la page précédente (rechargée) n’a pas pu terminer sa session ;
    // celle-ci reste utilisable.
    if (String(api.LMSInitialize("")) !== "true" && String(api.LMSGetLastError?.()) !== "101") return null;
    const get = name => String(api.LMSGetValue(name) ?? "");
    const set = (name, value) => api.LMSSetValue(name, String(value));
    let best = Number.parseFloat(get("cmi.core.score.raw"));
    if (!Number.isFinite(best)) best = 0;
    let completed = get("cmi.core.lesson_status") === "completed";
    if (!completed) set("cmi.core.lesson_status", "incomplete");
    let finished = false;

    return {
      // Numéros des questions réussies, gardés par le LMS ; [] à la première séance.
      succeeded() {
        try {
          const saved = JSON.parse(get("cmi.suspend_data") || "null");
          return Array.isArray(saved?.reussies) ? saved.reussies.filter(Number.isInteger) : [];
        } catch {
          return [];
        }
      },
      // Enregistre les réussites et la progression (pourcentage entier, de 0 à 100).
      report(succeeded, percent) {
        set("cmi.suspend_data", JSON.stringify({ reussies: succeeded }));
        best = Math.max(best, percent);
        set("cmi.core.score.min", 0);
        set("cmi.core.score.max", 100);
        set("cmi.core.score.raw", best);
        completed ||= best >= 100;
        set("cmi.core.lesson_status", completed ? "completed" : "incomplete");
        api.LMSCommit("");
      },
      // « Recommencer la feuille » : les réussites sont effacées, la note acquise reste.
      clear() {
        set("cmi.suspend_data", "");
        api.LMSCommit("");
      },
      // Fermeture de la page : « suspend » demande au LMS de reprendre la même tentative à la séance
      // suivante, avec ses réussites ; sinon, Moodle peut en ouvrir une nouvelle, vide.
      finish() {
        if (finished) return;
        finished = true;
        set("cmi.core.exit", "suspend");
        api.LMSCommit("");
        api.LMSFinish("");
      }
    };
  }

  return Object.freeze({ connect });
})();
