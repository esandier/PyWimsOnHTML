# Prompt de génération des questions PyWimsOnHTML

Tu rédiges un fichier source de question pour PyWimsOnHTML. Réponds uniquement
avec un fichier `.pwq` complet, sans bloc Markdown ni commentaire.

## Structure obligatoire

Écris chaque champ avec exactement ce format :

```text
%
% nom_du_champ
%
contenu du champ
```

Ajoute chaque champ après une ligne délimiteur contenant uniquement `%`.
Les champs sont, dans cet ordre : `question_title`, `question_keywords`, `question_layout`,
`question_setup`, `question_statement`, `question_solution_explanation` et `question_check`.
Ils sont obligatoires et non vides, sauf `question_solution_explanation` (voir
« Correction ») et `question_check` (voir « Correction : avec ou sans
`question_check` »), qui sont facultatifs. Un dernier champ facultatif,
`question_draws`, fixe le nombre de tirages calculés (entier de 1 à 200, 20 par
défaut) : n’en mets un que si on te le demande. Les noms des champs, des
variables et des outils sont en anglais ; tout autre nom de champ est refusé.
N’insère pas de ligne contenant uniquement `%` dans le contenu d’un champ.

Tout le contenu destiné à l’élève doit être en français, y compris le titre,
les mots-clés, l’énoncé et les messages de correction. Écris les mots-clés en
français, séparés par des virgules.

## Ce que les tirages font varier

Les tirages permettent à l’élève de refaire la question avec un nouvel énoncé.
Ce qui doit varier dépend de la compétence visée :

- **Un calcul** (fractions, calcul littéral, développer, dériver…) : faire
  varier les nombres et les expressions suffit, car refaire le calcul est
  l’entraînement lui-même.
- **Un choix** (traduire un énoncé en notation, choisir une méthode ou une
  formule, reconnaître un modèle ou une loi) : faire varier seulement les
  nombres ne sert à rien, puisqu’une fois la méthode trouvée, l’élève refait
  le même calcul. Fais varier la situation : écris dans `question_setup` une
  liste d’au moins une quinzaine de situations (contextes et tournures
  différents), tirée avec `choice`. Fais revenir un même contexte avec des
  questions différentes, pour que ce soit la question posée, et non le
  contexte, qui décide de la réponse.

## Python

- Le code Python va dans `question_setup` (tirage aléatoire et calcul des solutions) et,
  s’il existe, dans `question_check` (correction). `question_check` voit toutes les variables de
  `question_setup`.
- Rien n’est importé d’office : commence `question_setup` par les imports nécessaires,
  par exemple `from random import randint, choice` et `from sympy import *`.
- Tire le hasard uniquement avec le module `random` (ou `numpy.random`) : le
  compilateur calcule 20 tirages avec des graines fixes, puis le navigateur
  rejoue le tirage affiché avec la même graine. Une autre source de hasard
  (heure, `secrets`, `numpy.random.default_rng()` sans graine…) rendrait le
  tirage impossible à reproduire : le compilateur exécute chaque graine deux
  fois et refuse la question si les deux tirages diffèrent.
- Les outils PyWims s’importent depuis le module `pywims` :
  `from pywims import math_expression, mcq, tex, ANY`.
  - `math_expression(saisie)` analyse une expression écrite par un élève
    (`2x`, `x^2`, `sqrt(2)`, `sin x`, `ln(x)`), en n’admettant que les
    fonctions mathématiques usuelles, et renvoie une expression SymPy ou
    `None` si la saisie est invalide. Utilise-la pour toute
    saisie qui peut contenir une expression. Elle ne calcule rien : `6/8`,
    `x+x`, `sqrt(4)`, `sin(pi)`, `1.5` restent tels quels, ce qui permet
    de vérifier la forme (`fraction(...)` donne `(6, 8)`). Pour comparer la
    valeur, écris `simplify(math_expression(saisie) - solution) == 0` ; `==`
    compare l’écriture, à l’ordre des termes près (`2x+3x^2 == 3*x**2 + 2*x`).
    Pour exiger une forme, décris-la aussi avec `math_expression`, car SymPy
    calcule la solution écrite en Python (`2*(x+1)` devient `2*x + 2`) :
    `math_expression(saisie) == math_expression('2(x+1)')`.
  - `tex(valeur)` écrit un nombre ou une expression pour une formule TeX, comme
    `{{ valeur }}` dans l’énoncé (voir « Énoncé ») : `tex(Rational(3, 4))` donne
    `3/4`, `tex(p, frac=True)` `\frac{3}{4}`, `tex(Rational(9, 10), dec=True)`
    `0{,}9`, `tex(sqrt(2), digits=2)` `1{,}41`. Sers-t’en dans `question_setup`
    pour fabriquer un texte qui n’est pas dans l’énoncé, par exemple les choix
    d’un QCM : `[f"${tex(v)}$" for v in values]`. N’utilise pas `latex` de SymPy
    pour cela.
  - `mcq(correct=…, wrong=[…], count=4)` tire les choix d’un QCM : voir
    « Questions à choix ».
- Toute chaîne Python qui contient une formule TeX s’écrit en **chaîne brute**,
  préfixée par `r` : `feedback = r'Simplifiez $\frac{6}{8}$ par $2$.'`, et non
  `'… $\frac{6}{8}$ …'`. Dans une chaîne ordinaire, Python transforme `\f`
  (de `\frac`), `\t` (de `\times`, `\text`), `\r` (de `\right`)… en caractères
  invisibles, et la formule s’affiche en erreur. C’est vrai pour `feedback`,
  les choix et toute autre chaîne ; pour une chaîne
  formatée, écris `rf'…'`. Le compilateur refuse une chaîne qui contient un
  tel caractère.
- Dans `question_check`, `ok_answer['nom_du_champ']` arrive déjà rempli par la
  correction sans `question_check` (voir plus bas) : affecte `True` ou `False`
  seulement aux champs que tu juges autrement, par exemple quand plusieurs
  écritures sont justes. Un champ `input_math` n’est pas pré-rempli : affecte
  toujours son verdict. Pour une matrice, une entrée par case, nommée exactement
  `ok_answer["nom_du_champ[{}][{}]".format(i, j)]`.
- Définis aussi dans `question_check` la variable `feedback`, le retour affiché à
  l’élève (formules TeX admises). Elle est facultative : sans elle, le retour
  est « Bravo, c’est exact ! », ou en cas d’erreur « Réponse incorrecte. »
  (une seule réponse attendue) ou « Certaines réponses sont incorrectes. »,
  complété par « La valeur est juste, mais… » pour un `input_value` mal écrit.

## Correction : avec ou sans `question_check`

- **Sans `question_check`**, l’élève doit donner ce qu’affiche le bouton « Correction » :
  chaque saisie est comparée à la solution du tirage, sans Python, ce qui rend
  la question plus légère et plus rapide. Sont seulement ignorés les espaces, le
  signe moins typographique « − » et le codage des accents. Tout le reste
  compte : majuscules, ordre des termes (`1 + x^2` est faux pour `x^2 + 1`),
  fractions équivalentes (`14/24` est faux pour `7/12`), séparateur décimal
  (`0,5` est faux pour `0.5`).
- **N’écris pas `question_check`** pour une question à choix corrigée en tout ou rien,
  ni pour une réponse numérique (`input_value`, même approchée ou en fraction)
  sauf pour un retour ciblé selon l’erreur (voir « Valeurs numériques »),
  ni pour un champ texte dont la réponse a une seule écriture (un mot).
- **Écris `question_check`** quand plusieurs écritures d’une expression sont justes
  (termes dans un autre ordre), pour un retour ciblé
  selon l’erreur, et toujours pour un champ `input_math` : une formule se
  corrige par une comparaison symbolique, par exemple
  `simplify(math_expression(saisie) - solution) == 0`.
- La solution s’affiche telle que SymPy l’écrit (`19/12`, `x^2 + 1`). Un
  flottant est arrondi à 12 chiffres significatifs et s’écrit avec un point
  (`0.1 + 0.2` donne `0.3`). Pour une réponse numérique, utilise `input_value`,
  qui accepte la virgule et le point et affiche la solution avec une virgule.
- Un indice qui ne dépend pas de la réponse de l’élève va dans le champ
  `question_solution_explanation`, affiché avec la solution : il ne demande pas
  de `question_check`.

## Énoncé et champs de saisie

- `question_statement` et `question_solution_explanation` sont des **modèles
  Jinja**, rendus pour chaque tirage avec les variables et les fonctions de
  `question_setup`. Écris dans le modèle tout le texte qui varie d’un tirage à
  l’autre, et non dans des chaînes Python de `question_setup` :
  ```
  {% if kind == "exactly" %}
  Quelle est la probabilité qu’exactement {{ k }} photons traversent ?
  {% else %}
  Quelle est la probabilité qu’au moins un photon traverse ?
  {% endif %}
  $\mathcal{B}\left({{ n }}, {{ p }}\right)$, et
  $\mathbb{E}(X) = {% for v in values %}{{ v }}{% if not loop.last %} + {% endfor %}$.
  ```
  `{{ expression }}`, `{% if %}`, `{% for %}`, `{% set %}`, les macros et les
  filtres de Jinja sont admis. Jinja n’a pas d’autres fonctions de Python que
  les siennes (`range`, filtres `length`, `join`…) : définis ou importe dans
  `question_setup` celles dont tu as besoin, puis appelle-les dans le modèle
  (`{{ P(C, E) }}`). Une variable absente est une erreur de compilation.
- Une valeur `{{ v }}` s’écrit comme le fait `tex` : un rationnel (`Rational`
  ou `Fraction`) en ligne, `3/4` ; un objet SymPy en LaTeX ; un texte tel quel.
  Deux filtres :
  - `{{ v|frac }}` écrit la fraction en grand, `\frac{3}{4}` : pour une
    formule centrée `$$…$$` ou un `$\displaystyle …$` ;
  - `{{ v|dec }}` écrit un décimal avec la virgule de TeX, `0{,}9` (un
    rationnel sans décimal fini reste une fraction), et `{{ v|dec(2) }}`
    l’arrondit à deux décimales, au plus proche. N’emploie `dec` que dans une
    formule `$…$`. N’arrondis pas toi-même avec `round` (il arrondit 2,675 à 2,67).
- Dans une commande TeX, sépare `{{ … }}` des accolades de TeX par des
  espaces : `x^{ {{n}} }`, `\frac{ {{a}} }{2}`. Trois accolades de suite
  (`x^{{{n}}}`) sont refusées. Écris les formules TeX avec `$...$`, `$$...$$`,
  `\(...\)` ou `\[...\]`. Le HTML est autorisé, y compris dans une valeur.
- Dans une formule TeX écrite à la main, la virgule décimale est `{,}` :
  `$0{,}35$`. Une virgule seule est lue comme une ponctuation, suivie d’une
  espace : `$0,35$` s’affiche « 0, 35 ».
- Un champ de réponse ne peut pas être placé dans un `{% if %}` ni dans un
  `{% for %}` : chaque tirage a les mêmes champs. Adapte le texte autour du
  champ. Ses attributs sont des nombres, des textes entre guillemets ou des
  noms de variables, jamais des expressions : `solution=total`, pas
  `solution=a + b` (calcule `total` dans `question_setup`).
- Une figure fournie par l’enseignant s’affiche avec `<img src="figure.png"
  alt="description">`, dans l’énoncé ou l’explication. Dis à l’enseignant de
  réunir le `.pwq` et ses images dans une archive `.pwqa` (un fichier `.zip`
  renommé) : le compilateur y prend les images et les intègre à la page.
  N’invente jamais une image qu’on ne t’a pas donnée.
- Champs pris en charge ; `solution=` est obligatoire et désigne une variable
  de `question_setup` qui contient la bonne réponse :
  - `{{ input_value('nom', solution=variable, tolerance=0.01, form=decimal) }}` :
    réponse numérique, voir « Valeurs numériques » ci-dessous.
  - `{{ input_text('nom', solution=variable, style='CSS facultatif', match=normal) }}` :
    réponse écrite ; `match=exact` exige le texte caractère pour caractère,
    `match=loose` ignore en plus majuscules, accents et ponctuation finale
    (pour un mot ou un nom).
  - `{{ input_math('nom', solution=variable) }}` (saisie mathématique MathLive)
  - `{{ input_matrix('nom', size=n, solution=variable, input_style='CSS facultatif') }}`
    ou `{{ input_matrix('nom', rows=m, cols=p, solution=variable) }}` ; chaque
    dimension est un entier ou une variable entière de `question_setup`, entre 1 et 10.
  - `{{ input_vmatrix('nom', max_rows=5, max_cols=5, solution=variable, input_style='width:2em') }}` :
    matrice que l’élève redimensionne lui-même. Comme pour une matrice fixe,
    une case prend la taille de son champ (2em de large par défaut) ;
    `cell_width` et `cell_height` l’imposent si besoin.
  - `{{ input_select('nom', choices=liste, solution=indice) }}` : liste
    déroulante placée dans une phrase, pour un texte à trous (« La fonction
    est {{ input_select('sense', choices=senses, solution=correct) }} sur
    $\mathbb{R}$. »). Les choix sont du texte simple, sans formule ni HTML ;
    `shuffle=0` garde leur ordre (« croissante », « décroissante »). La
    saisie arrive dans `question_check` comme un indice, ou `None`.
  - `{{ input_radio('nom', choices=liste, solution=indice) }}` (choix unique) et
    `{{ input_checkbox('nom', choices=liste, solution=indices) }}` (choix
    multiple) : voir « Questions à choix » ci-dessous.
- Une unité après un champ s’y attache par une espace insécable :
  `{{ input_value('length', solution=bc) }}&nbsp;cm`. Sinon, l’unité peut passer
  seule à la ligne suivante, et l’élève est tenté de l’écrire dans le champ.
- Le nom d’un champ est aussi le nom de la variable Python qui reçoit la
  saisie dans `question_check` (une chaîne, une liste de listes de chaînes pour une
  matrice, un indice ou une liste d’indices pour une question à choix, un nombre
  pour `input_value`). Il ne doit pas reprendre un nom de `question_setup`, ni `ok_answer`,
  `feedback`, un outil de `pywims` ou un mot-clé Python. Donne-lui un nom anglais
  (`answer`, `result`, `matrix`…), comme aux variables de `question_setup`.

## Valeurs numériques

- Pour toute réponse qui est un nombre, utilise `input_value`, et non
  `input_text` : il compare la valeur exacte, sans `question_check`, et
  accepte la virgule comme le point (`1,5`, `1.5` et `3/2` sont la même valeur).
- `solution=` désigne un nombre Python ou SymPy : `int`, `float`,
  `Rational(3, 2)`, `sqrt(2)`, `pi`… Garde-le exact (`Rational`, pas `1/3`).
- `tolerance=0.01` admet un écart absolu ; sans lui, la valeur doit être
  exacte. Un irrationnel (`sqrt(2)`) exige une tolérance.
- `form=` impose l’écriture : `any` (par défaut), `integer`, `decimal`,
  `fraction`, `irreducible` (fraction irréductible), `scientific`
  (`1,5×10^3`), `percent` (`42 %` pour une solution 0,42). Un pourcentage est
  un nombre : `42 %` est juste pour 0,42 avec `any`. Une valeur juste dans une autre forme est refusée, avec un
  retour qui le dit. N’impose une forme que si l’énoncé la demande.
- La solution affichée est écrite dans la forme demandée, arrondie selon la
  tolérance, au plus proche : `tolerance=0.005` affiche deux décimales. Donne
  donc la solution **exacte**, avec `tolerance=0.005` pour une réponse
  arrondie au centième, sans l’arrondir dans `question_setup`.
- **Avec `question_check`**, écrit seulement pour un retour ciblé selon
  l’erreur, le champ arrive comme sa valeur exacte, un `Rational` de SymPy
  (`0,35`, `7/20` et `14/40` donnent tous `Rational(7, 20)`), ou `None` si la
  saisie n’est pas un nombre.
  `ok_answer['nom']` est déjà rempli, tolérance et forme comprises. Il ne
  reste qu’à reconnaître les erreurs prévues :
  ```python
  if p == pa + pb:
      feedback = r"Tu as oublié de retirer $P(A \cap B)$."
  ```
  Sans `feedback`, l’élève reçoit le retour habituel, y compris pour une
  valeur juste mal écrite.

## Questions à choix

- `choices=` désigne une liste de `question_setup`, d’au moins deux choix, dans ton
  ordre. Un choix est un texte simple, où les formules TeX sont admises, en
  chaîne brute (`r"$\frac{1}{2}$"`), ou un objet SymPy, affiché comme une
  formule. Pour écrire un nombre dans un choix, emploie `tex` :
  `f"${tex(p)}$"`. Le HTML n’est pas interprété dans un choix.
- `solution=` désigne l’indice du bon choix (`input_radio`) ou la liste des
  indices des bons choix (`input_checkbox`), éventuellement vide. Les indices
  commencent à 0, dans l’ordre de `choices`.
- **Choix calculés** : quand la bonne réponse dépend des valeurs tirées, écris
  une réserve d’erreurs types et laisse `mcq` choisir :
  `choices, correct = mcq(correct=a * b, wrong=[a + b, a * b + 1, a * (b - 1), (a + 1) * b], count=4)`
  renvoie 4 choix mélangés et l’indice du bon. Pour un choix multiple,
  `mcq(correct=[…], wrong=[…], count=5, correct_count=2)` renvoie la liste des
  indices des bons. `mcq` retire les doublons et les mauvaises réponses égales
  à une bonne ; prévois donc une réserve plus large que nécessaire (sinon la
  compilation échoue pour le tirage en cause).
- Ne mélange pas les choix toi-même : le compilateur les mélange à chaque
  tirage. `fixed_last=n` garde les n derniers choix à la fin, dans ton ordre
  (pour « Aucune de ces réponses », par exemple). `shuffle=0` garde tous les
  choix dans ton ordre, quand cet ordre a un sens (« 1 », « 2 », « 3 »,
  « plus de 3 ») ; il ne se combine pas avec `fixed_last`.
- Deux choix ne doivent jamais avoir le même texte, pour aucun tirage : avec
  des choix calculés (erreurs types), vérifie qu’ils restent distincts, sinon
  la compilation est refusée.
- Sans `columns`, les choix ont tous la taille du plus grand, sur autant de
  colonnes que la largeur le permet.
  `columns=n` (de 1 à 6) les place sur n colonnes sur grand écran ; réserve-le
  aux choix courts (nombres, formules brèves). Sur téléphone, les colonnes se
  réduisent d’elles-mêmes.
- Aucun choix n’est ajouté automatiquement : pour proposer « Aucune de ces
  réponses », écris-le comme dernier choix, avec `fixed_last=1`, et mets son
  indice dans la solution quand aucun autre choix n’est bon.
- Sans `question_check`, la question est juste si les choix cochés sont exactement ceux
  de la solution. N’écris `question_check` que pour un retour ciblé selon les choix
  cochés.
- Dans `question_check`, le champ contient l’indice choisi (`input_radio`) ou la liste
  croissante des indices cochés (`input_checkbox`, `[]` si rien n’est coché),
  dans l’ordre de `choices`. Un choix multiple se corrige en tout ou rien :
  `ok_answer['nom'] = nom == sorted(correct)` (la saisie est triée ; `sorted`
  est inutile si `correct` l’est déjà). Le `feedback` peut expliquer l’erreur
  selon les choix cochés, sans donner la réponse.
- `scoring='…'` (facultatif) donne une note indicative selon la syntaxe d’AMC,
  par exemple `scoring='b=1,m=-0.5,p=0'` ou `scoring='mz=1'`. Directives admises :
  `b`, `m`, `v`, `e`, `d`, `p`, `P`, `mz`, `haut`, `MAX`. Un barème n’est admis
  que si le champ à choix est le seul champ de la question. Sans barème, aucune
  note n’est affichée.

## Solution

- Le bouton « Correction » remplit tous les champs avec leur solution, y compris
  ceux que l’élève avait justes. Pour une matrice, la solution est une `Matrix`
  ou une liste de lignes.
- Quand plusieurs réponses sont justes, marque les valeurs quelconques avec
  `ANY` : elles s’affichent « ∗ ». Exemple pour une matrice triangulaire :
  `solution_matrix = Matrix(n, n, lambda i, j: 0 if i > j else ANY)`.
- Le champ facultatif `question_solution_explanation` est affiché avec la
  solution, pour l’éclairer. C’est un modèle Jinja, comme `question_statement`
  (HTML, formules, `{{ … }}`, `{% if %}`, `{% for %}`) ; il ne contient aucun
  champ de saisie. Une explication propre au cas tiré s’écrit avec
  `{% if %}` ; une somme de termes avec `{% for %}`.
- La solution doit être jugée juste : pour chaque tirage, le compilateur la
  saisit comme le ferait un élève (texte de la solution, `1` pour une valeur
  `ANY`, indices pour une question à choix), la corrige (par `question_check`, ou par
  comparaison sans `question_check`) et refuse la question si un champ est jugé faux, si
  `question_check` plante, ou si une solution texte est vide.

## Retour à l’élève

La variable `feedback` explique l’erreur sans donner la réponse : la réponse est le rôle du
bouton « Correction ». Par exemple « 6 est bien un diviseur commun, mais ce n’est
pas le plus grand » plutôt que « la réponse était 12 ».

Dans `feedback`, seules ces balises de mise en forme sont interprétées, sans
attribut : `<b>`, `<i>`, `<strong>`, `<em>`, `<sup>`, `<sub>`, `<br>`. Tout
autre HTML s’affiche tel quel.

N’invente pas de mises en page, de composants, d’API d’exécution ni de
bibliothèques Python. La seule mise en page prise en charge est `STD`.
N’invente pas de filtres Jinja : seuls ceux de Jinja et `frac`, `dec` existent. Si la question demandée
nécessite une fonctionnalité non prise en charge, signale-le séparément au lieu
de proposer une approximation silencieuse.

## Convertir une question AMC

On peut te donner une ou plusieurs questions écrites en LaTeX pour
auto-multiple-choice (AMC). Convertis chaque question en un fichier `.pwq` :

| AMC | `.pwq` |
|---|---|
| `\begin{question}` | `input_radio` |
| `\begin{questionmult}` | `input_checkbox` |
| texte avant `\begin{reponses}` | `question_statement`, avant le champ |
| `\bonne{…}`, `\mauvaise{…}` | la liste `choices` et les indices de `solution` |
| `\lastchoices` | `fixed_last` : nombre de choix qui le suivent |
| case « Aucune de ces réponses » ajoutée par l’option `completemulti` | un dernier choix écrit explicitement, avec `fixed_last=1`, juste quand aucun autre ne l’est |
| `reponseshoriz` | `columns` égal au nombre de choix, si les choix sont courts |
| `\explain{…}` | le champ `question_solution_explanation` |
| `\bareme{…}` | `scoring='…'`, recopié tel quel |
| `\baremeDefautS{…}`, `\baremeDefautM{…}` | recopiés dans le `scoring` de chaque question concernée, sauf si elle a son propre barème |
| `\FPeval`, macros de calcul, valeurs tirées au hasard | Python dans `question_setup`, avec `random` |
| identifiant de la question (`{premiers}`) | nom du fichier ; le nom du champ est un identifiant Python, par exemple `answer` |
| `\AMCnoCompleteMulti`, `\scoring`, mise en page (`\vspace`, `\element`…) | ignorés |

- Transpose le texte de l’énoncé : `\textbf{…}` → `<b>…</b>`, `\emph{…}` et
  `\textit{…}` → `<i>…</i>`, `\og … \fg` → « … », `~` → espace, `\\` →
  `<br>`. Garde les formules `$…$` telles quelles. Dans un choix, le HTML
  n’est pas interprété : écris un texte simple.
- Un titre et des mots-clés en français sont obligatoires : déduis-les de la
  question.
- N’écris pas de `question_check` : AMC n’a pas de retour selon la réponse, et la
  correction sans `question_check` vérifie déjà la réponse en tout ou rien. Écris-en un
  seulement si l’on te demande des retours ciblés ; il écrit alors un
  `feedback` utile, qui ne donne pas la réponse (voir
  `questions/nombres-premiers.pwq`).
- Ne transpose pas en silence ce qui n’a pas d’équivalent : question ouverte
  (`\AMCOpen`), barème par
  réponse (`\bonne{…}\bareme{…}`), directive `formula`, `set.…`, `default.…`,
  `requires.…`, `auto`, `SUF`, `allowempty`. Signale-les séparément.
- Une réponse numérique (`\AMCnumericChoices{valeur}{digits=…,decimals=…}`)
  devient `input_value`, avec une tolérance d’une demi-unité de la dernière
  décimale demandée (`decimals=2` donne `tolerance=0.005`).
- Une image (`\includegraphics{figure}`) devient `<img src="figure.png"
  alt="…">` ; rappelle de joindre l’image au `.pwq` dans une archive `.pwqa`.
- Pour plusieurs questions, donne les fichiers l’un après l’autre, chacun
  précédé d’une ligne `=== nom-du-fichier.pwq ===`.

Exemple. Source AMC :

```latex
\begin{questionmult}{premiers}\bareme{b=1,m=-0.5,p=0}
  Parmi les nombres suivants, lesquels sont \textbf{premiers}~?
  \begin{reponses}
    \bonne{$7$}
    \mauvaise{$9$}
    \bonne{$13$}
    \mauvaise{$21$}
    \lastchoices
    \mauvaise{Aucun de ces nombres}
  \end{reponses}
  \explain{Un nombre premier a exactement deux diviseurs : $1$ et lui-même.}
\end{questionmult}
```

Fichier `.pwq` (les nombres sont tirés au hasard, ce qu’AMC ne faisait pas ;
c’est permis quand la question s’y prête) :

```text
%
% question_title
%
Reconnaître des nombres premiers
%
% question_keywords
%
arithmétique, nombres premiers, QCM
%
% question_layout
%
STD
%
% question_setup
%
from random import sample
from sympy import isprime

numbers = sample(range(2, 50), 4)
choices = [f"${n}$" for n in numbers] + ["Aucun de ces nombres"]
correct = [i for i, n in enumerate(numbers) if isprime(n)]
if not correct:
    correct = [4]
%
% question_statement
%
Parmi les nombres suivants, lesquels sont <b>premiers</b> ?
{{ input_checkbox('answer', choices=choices, solution=correct, columns=5, fixed_last=1, scoring='b=1,m=-0.5,p=0') }}
%
% question_solution_explanation
%
Un nombre premier a exactement deux diviseurs : $1$ et lui-même.
%
```

## Exemple

```text
%
% question_title
%
Plus grand diviseur commun
%
% question_keywords
%
arithmétique, PGCD, nombres entiers
%
% question_layout
%
STD
%
% question_setup
%
from random import randint
from sympy import gcd

x = randint(10, 100)
y = randint(10, 100)
result = gcd(x, y)
%
% question_statement
%
Quel est le plus grand diviseur commun de ${{x}}$ et ${{y}}$ ?
{{ input_value('answer', solution=result, style='width:5em') }}
%
% question_solution_explanation
%
${{result}}$ divise ${{x}}$ et ${{y}}$, et c’est le plus grand entier qui les divise tous les deux :
l’algorithme d’Euclide permet de le trouver.
%
% question_check
%
# answer est la valeur saisie (None si ce n’est pas un nombre) ; ok_answer est déjà rempli.
if ok_answer['answer']:
    feedback = 'Bravo, c’est exact !'
elif answer is not None and answer.is_Integer and answer > 0 and x % answer == 0 and y % answer == 0:
    feedback = 'C’est bien un diviseur commun, mais ce n’est pas le plus grand.'
else:
    feedback = 'Ce nombre ne divise pas les deux entiers.'
%
```
