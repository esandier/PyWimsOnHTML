# Journal des décisions

`SPECIFICATION.md` décrit PyWimsOnHTML tel qu’il est. Ce journal en garde le
pourquoi : les solutions écartées, les essais, et l’histoire des choix qui
ont changé. Il est rangé sous les mêmes numéros de section que la
spécification ; une section sans décision notable n’y figure pas.

Avant de revenir sur un choix de la spécification, lire ce qui en est dit ici :
beaucoup de « simplifications » évidentes ont déjà été essayées.

## 2. Format `.pwq`

### 2.1 Champs

- **Anciens noms de PyWims** (`avant`, `enonce`, `apres`, `tirages`,
  `bareme`, `LIBRE`, `decimal_fr`, `is_nombre`, `explication_solution`) :
  refusés sans compatibilité. Un mélange des deux langues serait pire qu’une
  conversion, faite une fois.
- **Explication de la solution.** Jusqu’en octobre 2026, c’était une variable
  Python (`explication_solution`) : une chaîne `rf"…"` aux accolades de LaTeX
  doublées, source d’erreurs. Elle s’écrit désormais comme l’énoncé.

### 2.3 Balises de saisie

- **Clavier des téléphones.** Le pavé décimal (`inputmode="decimal"`), plus
  rapide pour des chiffres, n’a sur iPhone ni signe moins, ni barre de
  fraction, ni lettre, et seulement le séparateur décimal de la langue du
  téléphone : `-1`, `1/2` ou `0.5` y seraient impossibles à taper. Le clavier
  texte complet coûte une saisie des chiffres un peu plus lente (page « 123 »
  du clavier). Un clavier choisi par l’auteur reste un point ouvert (§ 12).

### 2.6 Correction par défaut

- **Pré-remplissage de `ok_answer`.** D’abord écarté (v1.0 : `question_check`
  décidait seul). Il est revenu avec `input_value` (§ 2.8), où le verdict par
  défaut (tolérance, forme) est le point de départ naturel d’un retour ciblé,
  et s’étend à tous les champs pour garder une seule règle.
- **`input_math` sans correction par défaut.** Essai sur 23 cas, en passant la
  solution et une frappe d’élève par MathLive :
  - SymPy, et non l’auteur, choisit l’écriture de la solution : `(x+1)/2`
    devient `x/2 + 1/2`, `ln(x)` devient `\log(x)`, et l’ordre des termes est
    le sien ; l’élève devrait deviner ces conventions ;
  - MathLive garde des traces de la frappe (un numérateur tapé entre
    parenthèses les conserve) ;
  - ignorer les espaces confondrait le produit `p i` et le nombre π.

  Surtout, pour une formule, l’enseignant attend presque toujours une
  expression égale, pas une écriture : c’est une comparaison symbolique, donc
  Python.

### 2.8 Valeurs numériques

- **Un seul lecteur de nombres**, celui de `runtime/correction.js`. Écartés :
  - une fonction Python de lecture (`read_number`) : un second lecteur, à
    garder identique au premier ;
  - un dictionnaire par champ (`nom["value"]`, `nom["ok"]`) pour tous les
    types : il changeait le format de toutes les questions, alourdissait le
    cas courant (un champ texte n’a que son texte) et se prêtait mal aux
    matrices.
- **Tolérance.** Écartées : une tolérance relative (`1%`) et une tolérance
  calculée par tirage (variable de `question_setup`). L’écart absolu couvre
  les exercices courants, et l’une ou l’autre s’ajoutera sans rien changer à
  l’existant.

### 2.9 Texte à trous : `input_select`

- Écartée : une liste dessinée par la page (pour y afficher des formules).
  Elle se manie mal au doigt et au clavier, et le `<select>` natif suffit aux
  mots d’un texte à trous.

### 2.10 Modèles : Jinja

- **Pourquoi Jinja (octobre 2026).** Le format imitait Jinja (`{{ }}`,
  `{% %}`) sans en avoir le sens : `{{ }}` n’admettait qu’un nom, et il n’y
  avait ni `{% if %}` ni `{% for %}`. Tout texte qui variait avec le tirage
  se fabriquait donc en chaînes Python dans `question_setup` (`f"…"`, accolades
  de LaTeX doublées, `\\`), illisibles ; et les IA, qui connaissent Jinja,
  écrivaient des `{% if %}` refusés.
- **Rendu à la compilation, pas dans la page.** La page reste sans Python pour
  les questions sans `question_check` (§ 1), et Jinja est déjà dans Pyodide.
  Prix : un énoncé rendu par tirage dans le fichier, au lieu d’un modèle et de
  valeurs ; c’est du même ordre que les chaînes fabriquées qu’il remplace.
  Perdu : l’aperçu provisoire, sans Python, où chaque variable s’affichait
  sous son nom ; montrer le modèle brut (les deux branches d’un `{% if %}`)
  a été jugé sans intérêt, et l’aperçu attend Python.
- **Champs hors des `{% if %}` et `{% for %}`** (« version limitée »). Des
  champs qui changent d’un tirage à l’autre obligeraient correction,
  contrôles et `question_check` à gérer une liste de champs par tirage : un
  vrai chantier, écarté pour l’instant. L’affichage progressif des questions à
  étapes reste en CSS (`:has`).
- **Notation des champs `{{ input_…(…) }}`.** Écartées :
  - garder `{% input_… %}` et l’enseigner à Jinja par une extension :
    l’extension serait du code à maintenir, et `{% %}` désigne pour Jinja une
    instruction, pas un affichage ;
  - garder la notation `{% input_… %}` : deux syntaxes proches pour deux sens,
    que les IA confondraient avec les instructions de Jinja.
  L’ancienne notation est refusée, sans compatibilité, comme les anciens noms
  (§ 2.1) ; les questions ont été converties par script.
- **Mécanisme : le champ est lu, pas exécuté.** Le compilateur remplace chaque
  champ par une marque à son nom avant le rendu, et la page remet le champ à
  la place de la marque : son HTML dépend de la page (identifiants `q2-…`,
  état). La page lit les attributs sans Python (affichage, correction par
  défaut) : ce sont des nombres, des textes ou des noms de variables, pas des
  expressions. Des expressions seraient possibles pour `solution`, `choices`,
  `rows` et `cols`, que seul le compilateur calcule ; reporté (octobre 2026),
  sans rien casser le jour où on le fera, un nom étant une expression.
- **Contrôle du tirage rejoué** (questions avec `question_check`) : la page
  compare les variables lues par le modèle, sans refaire le rendu, qui
  chargerait Jinja chez l’élève ; c’est le hasard qui risque de différer, pas
  Jinja. Fonctions et modules exclus : leur texte contient une adresse.
- **Valeurs non échappées.** Avant Jinja, une valeur n’admettait que `<b>`,
  `<i>`, `<br>`… Gardé, cet échappement aurait aussi échappé le HTML d’une
  macro. Le texte de l’élève n’entre jamais dans un modèle : rien à protéger.
- **Fractions en ligne par défaut, `|frac` pour les fractions en grand.**
  Écartée : une règle automatique selon la place (`a/b` en ligne, `\frac` dans
  `$$…$$` ou après `\displaystyle`) ; la même variable se serait écrite
  différemment selon l’endroit, sans que le modèle le dise.
- **Un seul outil d’écriture, `tex`**, filtre par défaut de Jinja et fonction
  de Python (les choix d’un QCM sont fabriqués en Python). Il remplace les
  `tex()`, `num()`, `dec()` recopiés dans les questions, et `decimal_comma`.
  Il s’appuie sur `sympy.latex` (`fold_short_frac`), et n’ajoute que ce que
  `latex` ne fait pas : un rationnel en décimal (`0,9` et non `9/10`),
  l’arrondi des demis vers le haut, les `Fraction` et `float` de Python.
  Son nom n’est pas `latex`, que `from sympy import latex` écraserait.
- **Pas d’outil d’arrondi.** Les `hundredth`, `tenth`, `rounded` des
  questions servaient surtout à arrondir une solution, ce que fait déjà
  `input_value` avec sa tolérance (§ 2.8) ; l’affichage arrondi passe par
  `|dec(n)`. Le seul autre cas (propagation d’un arrondi) reste rare et se
  calcule dans la question, commenté.
- **Fonctions de Python dans Jinja** (`zip`, `len`…) : non offertes pour
  l’instant ; s’ajouteront au besoin, sans rien casser.
- **Outils retirés : `py_wims`, `decimal_comma`, `is_number`.** `py_wims`
  lisait la saisie par `sympify`, sans le filtre de `math_expression` ;
  `decimal_comma` est remplacé par `tex` et `input_value` ; `is_number` ne
  servait plus.

## 3. Compilation

- **Hachage fixe** (`PYTHONHASHSEED=0`). Mesuré : `{"pomme", "poire", "kiwi",
  "figue"}` sortait dans un ordre différent d’une instance de Pyodide à
  l’autre ; `choice(list(un_ensemble))` donnait donc un autre tirage dans le
  navigateur qu’à la compilation.
- **Module `pywims` et script du Worker lus avec les fichiers du projet.** Ils
  ont d’abord été intégrés à la page du compilateur : une page restée en cache
  pouvait alors désaccorder les tirages calculés et les tirages rejoués.
- **Script du Worker dans un vrai fichier**, et non le texte d’une fonction de
  `python.js` (`pythonWorker.toString()`) : une telle fonction ne pouvait
  utiliser aucune variable de son fichier, piège que les outils ne signalent
  pas.
- **Python de l’aperçu par un pont.** Mesuré : un cadre qui chargeait son
  propre Pyodide attendait 6 à 8 s avant la première vérification, à chaque
  mise à jour de l’aperçu ; par le pont, la réponse est immédiate.
- **Boutons de l’aperçu.** Une case « Afficher la solution » et un bouton
  « Nouveau tirage », au-dessus d’un aperçu aux boutons inactifs, ont précédé
  l’aperçu interactif ; les boutons de la question font la même chose.
- **Cadre de l’aperçu jamais masqué puis rempli** (octobre 2026). Le retrait de
  l’aperçu provisoire l’avait fait masquer pendant le calcul : dans l’Edge de
  l’utilisateur, à partir du deuxième aperçu, la page reçue par le cadre masqué
  restait arrêtée dans son `<head>`, cadre blanc et inerte. Edge gèle un cadre
  isolé (autre origine) masqué. Ni Firefox, ni la page exportée, ni l’Edge piloté
  par les tests (Playwright le lance sans ce ralentissement) ne le montraient.
  Écartées après essai : MathJax, les polices de la charte, le cache et les
  extensions (même défaut en fenêtre InPrivate). L’aperçu précédent reste donc
  affiché pendant le calcul.

## 5. Comportement à l’exécution

### 5.1 Ouverture

- **Python au premier contact, pas à l’apparition à l’écran.** Le charger dès
  qu’une question apparaît le ferait aussi pour une question seulement
  regardée, alors que l’élève qui commence à répondre laisse de toute façon à
  Pyodide le temps de se charger.

### 5.2 Cycle de vie d’une question

- **« Correction »**, nommé « Solution » jusqu’en octobre 2026 : le nouveau
  nom incite davantage à lire la réponse attendue et l’explication. Il est
  offert aussi après une réponse juste (octobre 2026). Écarté : garder les
  réponses de l’élève et ajouter l’explication dessous, une seconde action
  pour un bouton qui doit rester simple ; la réussite reste de toute façon
  marquée par son ✓.
- **« Recommencer »** (question à un seul tirage) : on a écarté de le masquer,
  car c’est le seul moyen de refaire la question après « Correction ».

### 5.7 Style compact d’une activité

- Un tiroir montant du bas, sur téléphone, a été essayé (octobre 2026) et
  écarté au profit du retour sous la question.

## 10. Questions à choix

### 10.5 Barème et note

- L’avertissement d’une activité en partie notée était d’abord dans le message
  de l’en-tête, à l’export : il passait inaperçu. Il s’affiche désormais dans
  le cadre de l’aperçu, dès le choix des questions.

### 10.7 Activité et affichage

- **Cadre des choix.** Jusqu’en octobre 2026, un cadre arrondi entourait
  chaque choix, qui le faisait passer pour un champ ; seule la case est
  désormais encadrée.
- **Largeur des choix.** Avant octobre 2026, chaque choix prenait toute la
  largeur de l’énoncé : sur grand écran, « 12 » ou « vrai » se trouvait à
  l’extrémité gauche d’un long rectangle vide, loin de l’icône du verdict.
  Écartés :
  - les choix empilés à la largeur du plus long (essayé en octobre 2026) :
    une liste de nombres occupait toute la hauteur de l’écran pour rien ;
  - les choix à la suite, chacun à sa largeur (essayé aussi) : des boîtes
    inégales ne s’alignent pas. Le style compact (§ 5.7) les met pourtant à
    la suite : sans cadre, l’inégalité ne se voit plus.
- **Place de l’icône du verdict** (`width`, pas `flex-basis`). Avec une base
  flexible, la case était trop étroite de 19 px sous Firefox, et le texte
  perdait ces 19 px : un nombre court disparaissait, un mot passait à la
  ligne, une formule était coupée et défilait. Trouvé par un essai comparant
  Firefox et Edge (octobre 2026), après trois changements de disposition
  fondés sur de fausses hypothèses (polices tardives, copie MathML) ; le
  conteneur (`fieldset` ou `div`) et l’écriture des colonnes (`1fr` ou
  `minmax(0, 1fr)`) n’y changeaient rien.
- **Défilement.** Avant octobre 2026, chaque choix pouvait défiler, et tout
  dépassement d’une fraction de pixel d’une formule (métriques de MathJax et
  de la police, arrondi aux pixels de l’écran) affichait une barre ; trois
  correctifs locaux n’y ont pas suffi. D’où la règle actuelle (une seule
  mesure décide des colonnes et du défilement) et le test
  `tests/tools/scrollbars.py`.

### 10.9 Choix tirés au hasard : `mcq`

- Écartée : une syntaxe propre dans l’énoncé (choix écrits dans la balise).
  Les choix calculés dépendent des valeurs de `question_setup`, et une
  fonction Python les couple naturellement au même aléa.

## 11. Site du projet

- La cohérence (§ 3) et la liste par titre (§ 11.3) existaient déjà dans le
  compilateur local quand le site a été créé.

### 11.1 Publication

- **Fichiers du projet lus à côté du compilateur.** Ils étaient d’abord lus
  dans un dossier du projet choisi par l’utilisateur.
- **Lus une seule fois, à l’ouverture.** Ils ont d’abord été relus à chaque
  aperçu et à chaque compilation. Un atelier resté ouvert mêlait alors ses
  propres scripts, anciens, et les fichiers relus, plus récents : en octobre
  2026, une variable accentuée était trouvée par l’un et pas par l’autre
  (« Variable de question inconnue : dés »). Écartée : comparer les fichiers
  relus à ceux de la page et demander de la recharger.
- **Serveur local sans cache** (`compiler/local-server.py`) : avec le serveur
  de Python seul, le navigateur gardait d’anciennes versions des scripts, et
  une modification n’apparaissait pas. Sous Windows, ce serveur ouvrait aussi
  sans erreur un port déjà pris (`SO_REUSEADDR`) : `run-local.ps1` cherche un
  port vraiment libre.

### 11.3 Liste des questions

- Titre et types de champs étaient d’abord sur deux lignes : une question
  prenait 64 px de haut, 27 px sur une ligne, pour une page de travail
  compacte.

### 11.6 Page d’accueil, bandeau commun

- La page du compilateur s’appelle « Atelier » pour l’utilisateur depuis
  octobre 2026.

### 11.7 Étapes

La mise en ligne s’est faite en cinq étapes, toutes réalisées :
1. **Fichiers du projet lus en ligne** : plus de choix du dossier du projet ;
   `compiler/run-local.ps1` ; README mis à jour. Activation de GitHub Pages
   (par l’auteur).
2. **Dossier mémorisé** sur Chrome et Edge, nom rappelé sur Firefox et Safari,
   bouton « Relire ».
3. **Charte** : charte neutre par défaut, UPEC en exemple, charte du dossier.
4. **Liste regroupée par sous-dossier.**
5. **Mode d’emploi et modèles**, puis **page d’accueil et démonstrations**,
   publiés ensemble.

### 11.9 Ordre des questions d’une activité

- Avant la liste d’ordre, l’ordre de l’activité (celui des coches) était
  invisible, ne se changeait qu’en décochant et recochant, et « Relire » le
  remplaçait par l’ordre de la liste.
- Écartés :
  - des flèches sur chaque ligne : la question déplacée quitte sa ligne, et un
    second clic au même endroit déplaçait l’autre question, ce qui annulait le
    premier ;
  - le glisser-déposer : le glisser-déposer HTML ne marche pas au toucher, et
    le refaire avec les événements de pointeur coûte beaucoup pour un gain
    faible.

### 11.10 Atelier

- **Une seule question courante.** Des onglets, une question ouverte chacun,
  ont été essayés (octobre 2026) : ils faisaient une seconde « question
  courante », et on ne savait plus laquelle l’aperçu montrait.
- **Edge et Chrome seulement.** Firefox et Safari interdisent à une page
  d’écrire dans un dossier : il fallait télécharger le fichier, le remettre
  dans le dossier, rouvrir le dossier. Un premier éditeur fondé sur ce détour
  (octobre 2026) a été jugé inutilisable. Écartés aussi : un serveur local qui
  écrirait les fichiers (il faut Python, absent des Mac récents), une
  bibliothèque de questions gardée dans le navigateur (le dossier cesse d’être
  la référence), une application de bureau (installateurs et signature à
  maintenir).
- **Liste ou éditeur.** Écartés : une bascule « Liste | Éditeur » en tête du
  panneau, moins visible qu’un bouton sur la ligne, et un bouton « Modifier »
  au-dessus de l’aperçu.
- **Un seul bloc.** Des sous-onglets par champ, essayés d’abord, obligeaient à
  basculer sans cesse. CodeMirror 6 a été écarté : il demande un outil de
  construction (bundler).
- **Aperçu à la demande.** Un bouton « Essayer » a d’abord obligé à demander
  l’aperçu ; il a ensuite suivi chaque pause de la frappe, et montrait alors
  les erreurs passagères de la saisie et lançait des tirages inutiles. En
  octobre 2026, l’auteur a préféré une action volontaire (« Actualiser
  l’aperçu », Ctrl+Entrée).
- **Prompt et collage.** Le bouton de collage et son message étaient d’abord
  sur la ligne du dossier : le message écrasait le nom du dossier.
