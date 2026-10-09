// Correction par défaut, sans Python (SPECIFICATION.md, § 2.6) : sans « question_check », l’élève doit
// donner ce qu’affiche le bouton « Solution ». Partagée par le fichier généré et par le compilateur
// (contrôle de cohérence).
window.PyWimsCorrection = (() => {
  const choiceTypes = new Set(["input_radio", "input_checkbox", "input_select"]);

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

  // Écriture comparée selon le degré de conformité d’un champ texte (match, § 2.6) :
  //   - exact : caractère pour caractère, aux espaces de début et de fin près ;
  //   - normal : les différences typographiques de normalizedText ;
  //   - loose : en plus, ni les majuscules, ni les accents, ni la ponctuation finale, pour un mot
  //     ou un nom, où l’orthographe des accents n’est pas ce qu’on évalue.
  function matchedText(text, match = "normal") {
    if (match === "exact") {
      return String(text).normalize("NFC").trim();
    }
    const normal = normalizedText(text);
    if (match !== "loose") {
      return normal;
    }
    return normal.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[.!?;:,…]+$/u, "");
  }

  // Champ texte ou case de matrice : même écriture que la solution, une fois normalisée.
  function sameText(input, solution, match = "normal") {
    return typeof input === "string" && matchedText(input, match) === matchedText(solution, match);
  }

  // Valeurs numériques (input_value, SPECIFICATION.md, § 2.8). Les nombres sont des fractions exactes
  // { n, d } d’entiers BigInt, d > 0, irréductibles : la saisie, la solution et la tolérance se
  // comparent sans erreur d’arrondi (0,1 + 0,2 vaut exactement 0,3). Solution écartée : les
  // flottants de JavaScript, qui jugeraient fausse une saisie exacte à cause de l’arrondi binaire.
  const abs = value => (value < 0n ? -value : value);
  const gcd = (a, b) => {
    [a, b] = [abs(a), abs(b)];
    while (b) [a, b] = [b, a % b];
    return a;
  };
  function rational(n, d = 1n) {
    if (d === 0n) return null;
    if (d < 0n) [n, d] = [-n, -d];
    const divisor = gcd(n, d) || 1n;
    return { n: n / divisor, d: d / divisor };
  }
  const subtract = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
  const compare = (a, b) => {
    const difference = a.n * b.d - b.n * a.d;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  };
  const power10 = exponent => 10n ** BigInt(exponent);

  // Décimal écrit avec un point ou une virgule (« -1,25 ») en fraction exacte.
  function decimalRational(text) {
    const [whole, fraction = ""] = text.replace(",", ".").split(".");
    return rational(BigInt(whole + fraction), power10(fraction.length));
  }

  // Fraction « n/d » enregistrée dans le tirage (solution d’un champ input_value).
  function parseRational(text) {
    const [n, d = "1"] = String(text).split("/");
    return rational(BigInt(n), BigInt(d));
  }

  // Lit une saisie numérique : renvoie { value, kind, irreducible, scientific } ou null si ce n’est
  // pas un nombre. Virgule et point sont acceptés : un nombre seul est sans ambiguïté. Le
  // multiplié de la notation scientifique s’écrit ×, *, x ou ·.
  function parseNumber(text) {
    const source = normalizedText(text);
    let match = source.match(/^[+-]?\d+$/);
    if (match) {
      return { value: rational(BigInt(source)), kind: "integer" };
    }
    match = source.match(/^[+-]?\d+[.,]\d+$/);
    if (match) {
      return { value: decimalRational(source), kind: "decimal" };
    }
    match = source.match(/^([+-]?\d+)\/(\d+)$/);
    if (match) {
      const value = rational(BigInt(match[1]), BigInt(match[2]));
      if (!value) return null;
      return { value, kind: "fraction", irreducible: BigInt(match[2]) > 1n && gcd(BigInt(match[1]), BigInt(match[2])) === 1n };
    }
    match = source.match(/^([+-]?\d+(?:[.,]\d+)?)(?:[eE]([+-]?\d+)|[×*x·]10\^\(?([+-]?\d+)\)?)$/);
    if (match) {
      const mantissa = decimalRational(match[1]);
      const exponent = Number(match[2] ?? match[3]);
      if (Math.abs(exponent) > 400) return null;
      const scale = exponent >= 0 ? rational(power10(exponent)) : rational(1n, power10(-exponent));
      const value = rational(mantissa.n * scale.n, mantissa.d * scale.d);
      const size = rational(abs(mantissa.n), mantissa.d);
      return { value, kind: "scientific", scientific: compare(size, rational(1n)) >= 0 && compare(size, rational(10n)) < 0 };
    }
    return null;
  }

  // La saisie est-elle écrite sous la forme demandée (form, § 2.8) ?
  function hasForm(parsed, form) {
    switch (form) {
      case "integer": return parsed.kind === "integer";
      case "decimal": return parsed.kind === "integer" || parsed.kind === "decimal";
      case "fraction": return parsed.kind === "integer" || parsed.kind === "fraction";
      case "irreducible": return parsed.kind === "integer" || (parsed.kind === "fraction" && parsed.irreducible);
      case "scientific": {
        // Un nombre de 1 à 10 (exposant 0) et zéro s’écrivent aussi sans « ×10^0 ».
        if (parsed.kind === "scientific") return parsed.scientific;
        if (parsed.kind !== "integer" && parsed.kind !== "decimal") return false;
        const size = rational(abs(parsed.value.n), parsed.value.d);
        return parsed.value.n === 0n || (compare(size, rational(1n)) >= 0 && compare(size, rational(10n)) < 0);
      }
      default: return true;
    }
  }

  // Écriture exigée, dans le retour « bonne valeur, mauvaise forme ».
  const formNames = {
    integer: "sous forme d’entier",
    decimal: "sous forme décimale",
    fraction: "sous forme de fraction",
    irreducible: "sous forme de fraction irréductible",
    scientific: "en notation scientifique"
  };
  const formHint = form => `La valeur est juste, mais elle doit être écrite ${formNames[form]}.`;

  // Verdict d’un champ input_value : « correct », « form » (bonne valeur, mauvaise écriture) ou
  // « wrong ». solution : { text, value } du tirage ; attributes : tolerance et form de la balise.
  function valueVerdict(input, solution, { tolerance = "0", form = "any" } = {}) {
    const parsed = typeof input === "string" ? parseNumber(input) : null;
    if (!parsed) return "wrong";
    const gap = subtract(parsed.value, parseRational(solution.value));
    if (compare(rational(abs(gap.n), gap.d), decimalRational(String(tolerance))) > 0) return "wrong";
    return hasForm(parsed, form) ? "correct" : "form";
  }

  // Écriture décimale d’une fraction, avec une virgule : exacte si digits est null (la fraction doit
  // alors être un décimal fini), sinon arrondie à digits décimales, la moitié loin de zéro comme en
  // classe ; les zéros finaux sont retirés.
  function decimalText(value, digits = null) {
    let places = digits;
    if (places === null) {
      places = 0;
      while ((power10(places) * value.n) % value.d !== 0n && places < 400) places += 1;
    }
    const scaled = value.n * power10(places);
    const sign = scaled < 0n ? "-" : "";
    let units = abs(scaled) / value.d;
    if (digits !== null && 2n * (abs(scaled) % value.d) >= value.d) units += 1n;
    let text = units.toString().padStart(places + 1, "0");
    text = places ? `${text.slice(0, -places)},${text.slice(-places)}` : text;
    text = text.includes(",") ? text.replace(/0+$/, "").replace(/,$/, "") : text;
    return text === "0" ? "0" : sign + text;
  }

  // Un décimal fini : un dénominateur sans autre facteur premier que 2 et 5.
  function isFiniteDecimal(value) {
    let d = value.d;
    for (const factor of [2n, 5n]) while (d % factor === 0n) d /= factor;
    return d === 1n;
  }

  // Nombre de décimales qu’autorise une tolérance : le plus petit d tel qu’une demi-unité du
  // d-ième chiffre ne la dépasse pas ; null pour une tolérance nulle.
  function decimalsFor(tolerance) {
    if (tolerance.n === 0n) return null;
    for (let digits = 0; digits <= 60; digits += 1) {
      if (compare(rational(1n, 2n * power10(digits)), tolerance) <= 0) return digits;
    }
    return 60;
  }

  // Solution affichée d’un champ input_value (§ 2.8), écrite selon la forme demandée ; lève une
  // erreur explicite si elle ne peut pas l’être. raw : { value: "n/d", exact } calculé par Python ;
  // exact est faux pour un irrationnel, pris avec 30 chiffres significatifs.
  function valueSolutionText(raw, { tolerance = "0", form = "any" } = {}) {
    const value = parseRational(raw.value);
    const shown = `${value.n}${value.d === 1n ? "" : `/${value.d}`}`;
    const digits = decimalsFor(decimalRational(String(tolerance)));
    const needTolerance = what => new Error(`${what} : donnez une tolérance (tolerance=…).`);
    const fractionText = () => {
      if (!raw.exact) throw new Error("c’est un nombre irrationnel, qui ne s’écrit pas en fraction.");
      return shown;
    };
    const decimalOrRounded = what => {
      if (raw.exact && isFiniteDecimal(value)) return decimalText(value);
      if (digits === null) throw needTolerance(what);
      return decimalText(value, digits);
    };
    switch (form) {
      case "integer":
        if (value.d === 1n) return shown;
        if (digits === null) throw needTolerance(`${shown} n’est pas un entier`);
        return decimalText(value, 0);
      case "decimal":
        return decimalOrRounded(`${raw.exact ? shown : "ce nombre irrationnel"} ne s’écrit pas exactement en décimal`);
      case "fraction":
      case "irreducible":
        return fractionText();
      case "scientific": {
        if (value.n === 0n) return "0";
        // Exposant : 10^e ≤ |valeur| < 10^(e+1).
        const size = rational(abs(value.n), value.d);
        let exponent = size.n.toString().length - size.d.toString().length;
        const scale = e => (e >= 0 ? rational(power10(e)) : rational(1n, power10(-e)));
        if (compare(size, scale(exponent)) < 0) exponent -= 1;
        const mantissa = rational(value.n * scale(-exponent).n, value.d * scale(-exponent).d);
        let text;
        if (raw.exact && isFiniteDecimal(mantissa)) {
          text = decimalText(mantissa);
        } else {
          if (digits === null) throw needTolerance(`${raw.exact ? shown : "ce nombre irrationnel"} ne s’écrit pas exactement en notation scientifique`);
          // La tolérance porte sur la valeur : sur la mantisse, elle est divisée par 10^e.
          const mantissaDigits = Math.max(0, digits + exponent);
          text = decimalText(mantissa, mantissaDigits);
          // L’arrondi peut donner 10 : 9,96 devient 1×10^(e+1).
          if (/^-?10$/.test(text)) {
            text = text.replace("10", "1");
            exponent += 1;
          }
        }
        return exponent === 0 ? text : `${text}×10^${exponent}`;
      }
      default:
        if (raw.exact) {
          return isFiniteDecimal(value) ? decimalText(value) : shown;
        }
        return decimalOrRounded("c’est un nombre irrationnel");
    }
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

  // Verdict d’un champ, ou d’une case de matrice, d’après le type de sa balise, la solution du
  // tirage (§ 2.3) et les attributs de la balise (match, tolerance, form) ; une solution null est
  // une valeur libre (ANY) : toute réponse non vide convient.
  function isCorrect(type, input, solution, attributes = {}) {
    if (choiceTypes.has(type)) {
      return sameChoice(input, solution);
    }
    if (type === "input_math") {
      // Une formule ne se compare pas à l’écriture de sa solution (§ 2.6) : SymPy en choisit la
      // forme, et l’enseignant attend une expression égale. Le compilateur exige donc « question_check ».
      throw new Error("Un champ input_math n’a pas de correction par défaut : il exige un « question_check ».");
    }
    if (solution === null) {
      return typeof input === "string" && input.trim() !== "";
    }
    if (type === "input_value") {
      return valueVerdict(input, solution, attributes) === "correct";
    }
    return sameText(input, solution, attributes.match);
  }

  return Object.freeze({
    normalizedText, matchedText, sameText, sameChoice, isCorrect,
    parseNumber, valueVerdict, valueSolutionText, formHint
  });
})();
