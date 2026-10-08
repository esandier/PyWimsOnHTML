// Correction par défaut, sans Python (SPECIFICATION.md, § 2.6) : sans « apres », l’élève doit
// donner ce qu’affiche le bouton « Solution ». Partagée par le fichier généré et par le compilateur
// (contrôle de cohérence).
window.PyWimsCorrection = (() => {
  const choiceTypes = new Set(["input_radio", "input_checkbox"]);

  // Écriture comparée d’un champ texte : seules des différences purement typographiques sont
  // effacées, celles qu’un élève ne voit pas ou ne choisit pas :
  //   - les espaces, y compris insécables (« 1 000 » saisi au clavier français), car « x^2+1 » et
  //     « x^2 + 1 » se lisent de la même façon ;
  //   - le signe moins typographique « − » (U+2212), que produisent des claviers de téléphone et les
  //     copier-coller depuis un document ;
  //   - le codage des accents : la forme NFC unifie « é » en un caractère et « e » + accent.
  // Tout le reste compte, en particulier les majuscules (A et a sont deux objets mathématiques) et
  // le séparateur décimal : la virgule n’équivaut pas au point, car elle sépare les milliers en
  // anglais et des éléments en mathématiques (« (1, 5) » n’est pas « (1.5) »).
  function normalizedText(text) {
    return String(text).normalize("NFC").replace(/\u2212/g, "-").replace(/\s+/g, "");
  }

  // Champ texte ou case de matrice : même écriture que la solution, une fois normalisée.
  function sameText(input, solution) {
    return typeof input === "string" && normalizedText(input) === normalizedText(solution);
  }

  // Choix unique : l’indice choisi (null si rien n’est choisi) ; choix multiple : la liste des
  // indices cochés, juste si c’est exactement l’ensemble de la solution, dans n’importe quel ordre.
  function sameChoice(input, solution) {
    if (Array.isArray(solution)) {
      if (!Array.isArray(input) || input.length !== solution.length) return false;
      const expected = new Set(solution);
      return new Set(input).size === input.length && input.every(index => expected.has(index));
    }
    return input === solution;
  }

  // Verdict d’un champ, ou d’une case de matrice, d’après le type de sa balise et la solution du
  // tirage (§ 2.3) ; une solution null est une valeur libre (LIBRE) : toute réponse non vide convient.
  function isCorrect(type, input, solution) {
    if (choiceTypes.has(type)) {
      return sameChoice(input, solution);
    }
    if (type === "input_math") {
      // Une formule ne se compare pas à l’écriture de sa solution (§ 2.6) : SymPy en choisit la
      // forme, et l’enseignant attend une expression égale. Le compilateur exige donc « apres ».
      throw new Error("Un champ input_math n’a pas de correction par défaut : il exige un « apres ».");
    }
    if (solution === null) {
      return typeof input === "string" && input.trim() !== "";
    }
    return sameText(input, solution);
  }

  return Object.freeze({ normalizedText, sameText, sameChoice, isCorrect });
})();
