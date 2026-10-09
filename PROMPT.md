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
« Solution ») et `question_check` (voir « Correction : avec ou sans
`question_check` »), qui sont facultatifs. Un dernier champ facultatif,
`question_draws`, fixe le nombre de tirages calculés (entier de 1 à 200, 20 par
défaut) : n’en mets un que si on te le demande. Les noms des champs, des
variables et des outils sont en anglais ; tout autre nom de champ est refusé.
N’insère pas de ligne contenant uniquement `%` dans le contenu d’un champ.

Tout le contenu destiné à l’élève doit être en français, y compris le titre,
les mots-clés, l’énoncé et les messages de correction. Écris les mots-clés en
français, séparés par des virgules.

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
  `from pywims import py_wims, is_number, math_expression, decimal_comma, ANY`.
  - `math_expression(saisie)` analyse une expression écrite par un élève
    (`2x`, `x^2`, `sqrt(2)`, `sin x`, `ln(x)`), en n’admettant que les
    fonctions mathématiques usuelles, et renvoie une expression SymPy ou
    `None` si la saisie est invalide. Utilise-la pour toute
    saisie qui peut contenir une expression.
  - `py_wims(saisie)` convertit une saisie simple (nombre, fraction) en objet
    SymPy, ou renvoie `None`.
  - `is_number(valeur)` indique si une valeur est un nombre.
  - `decimal_comma(nombre, chiffres)` écrit un nombre arrondi à `chiffres`
    décimales, avec une virgule et sans zéros finaux : `decimal_comma(sqrt(2), 2)`
    donne `"1,41"`, `decimal_comma(1.5, 2)` donne `"1,5"`. Utilise-le comme
    solution d’une réponse décimale en français.
- Toute chaîne Python qui contient une formule TeX s’écrit en **chaîne brute**,
  préfixée par `r` : `feedback = r'Simplifiez $\frac{6}{8}$ par $2$.'`, et non
  `'… $\frac{6}{8}$ …'`. Dans une chaîne ordinaire, Python transforme `\f`
  (de `\frac`), `\t` (de `\times`, `\text`), `\r` (de `\right`)… en caractères
  invisibles, et la formule s’affiche en erreur. C’est vrai pour `feedback`,
  les choix et toute autre chaîne ; pour une chaîne
  formatée, écris `rf'…'`. Le compilateur refuse une chaîne qui contient un
  tel caractère.
- Si tu écris `question_check`, affecte `True` ou `False` à `ok_answer['nom_du_champ']`
  pour chaque champ. Pour une matrice, ajoute une entrée par case, nommée exactement
  `ok_answer["nom_du_champ[{}][{}]".format(i, j)]`.
- Définis aussi dans `question_check` la variable `feedback`, le retour affiché à
  l’élève (formules TeX admises). Elle est facultative : sans elle, le retour
  est « Bravo, c’est exact ! », ou en cas d’erreur « Réponse incorrecte. »
  (une seule réponse attendue) ou « Certaines réponses sont incorrectes. ».

## Correction : avec ou sans `question_check`

- **Sans `question_check`**, l’élève doit donner ce qu’affiche le bouton « Solution » :
  chaque saisie est comparée à la solution du tirage, sans Python, ce qui rend
  la question plus légère et plus rapide. Sont seulement ignorés les espaces, le
  signe moins typographique « − » et le codage des accents. Tout le reste
  compte : majuscules, ordre des termes (`1 + x^2` est faux pour `x^2 + 1`),
  fractions équivalentes (`14/24` est faux pour `7/12`), séparateur décimal
  (`0,5` est faux pour `0.5`).
- **N’écris pas `question_check`** pour une question à choix corrigée en tout ou rien,
  ni pour un champ texte dont la réponse a une seule écriture (un entier, une
  fraction irréductible, un mot).
- **Écris `question_check`** quand plusieurs écritures sont justes (expression dans un
  autre ordre, fraction non simplifiée, valeur approchée), pour un retour ciblé
  selon l’erreur, et toujours pour un champ `input_math` : une formule se
  corrige par une comparaison symbolique, par exemple
  `simplify(math_expression(saisie) - solution) == 0`.
- La solution s’affiche telle que SymPy l’écrit (`19/12`, `x^2 + 1`). Un
  flottant est arrondi à 12 chiffres significatifs et s’écrit avec un point
  (`0.1 + 0.2` donne `0.3`). Pour une réponse décimale écrite à la française,
  donne une solution texte avec `decimal_comma`.
- Un indice qui ne dépend pas de la réponse de l’élève va dans le champ
  `question_solution_explanation`, affiché avec la solution : il ne demande pas
  de `question_check`.

## Énoncé et champs de saisie

- Dans `question_statement`, utilise `{{variable}}` pour afficher une valeur de `question_setup`.
  Dans une commande TeX, sépare la variable des accolades de TeX par des
  espaces : `\frac{ {{n}} }{ {{m}} }`, et non `\frac{{{n}}}{{{m}}}`.
  Les objets SymPy s’affichent en LaTeX, à la taille du texte : pour une
  fraction en grand dans une ligne, écris `$\displaystyle {{f}}$`. Écris les formules TeX avec `$...$`, `$$...$$`,
  `\(...\)` ou `\[...\]`. Le HTML est autorisé.
- Champs pris en charge ; `solution=` est obligatoire et désigne une variable
  de `question_setup` qui contient la bonne réponse :
  - `{% input_text 'nom' solution=variable style='CSS facultatif' %}`
  - `{% input_math 'nom' solution=variable %}` (saisie mathématique MathLive)
  - `{% input_matrix 'nom' size=n solution=variable input_style='CSS facultatif' %}`
    ou `{% input_matrix 'nom' rows=m cols=p solution=variable %}` ; chaque
    dimension est un entier ou une variable entière de `question_setup`, entre 1 et 10.
  - `{% input_vmatrix 'nom' max_rows=5 max_cols=5 solution=variable input_style='width:2em' %}` :
    matrice que l’élève redimensionne lui-même. Comme pour une matrice fixe,
    une case prend la taille de son champ (2em de large par défaut) ;
    `cell_width` et `cell_height` l’imposent si besoin.
  - `{% input_radio 'nom' choices=liste solution=indice %}` (choix unique) et
    `{% input_checkbox 'nom' choices=liste solution=indices %}` (choix
    multiple) : voir « Questions à choix » ci-dessous.
- Le nom d’un champ est aussi le nom de la variable Python qui reçoit la
  saisie dans `question_check` (une chaîne, une liste de listes de chaînes pour une
  matrice, un indice ou une liste d’indices pour une question à choix). Il ne doit pas reprendre un nom de `question_setup`, ni `ok_answer`,
  `feedback`, un outil de `pywims` ou un mot-clé Python. Donne-lui un nom anglais
  (`answer`, `result`, `matrix`…), comme aux variables de `question_setup`.

## Questions à choix

- `choices=` désigne une liste de `question_setup`, d’au moins deux choix, dans ton
  ordre. Un choix est un texte simple, où les formules TeX sont admises, en
  chaîne brute (`r"$\frac{1}{2}$"`), ou un objet SymPy, affiché comme une
  formule. Le HTML n’est pas interprété dans un choix.
- `solution=` désigne l’indice du bon choix (`input_radio`) ou la liste des
  indices des bons choix (`input_checkbox`), éventuellement vide. Les indices
  commencent à 0, dans l’ordre de `choices`.
- Ne mélange pas les choix toi-même : le compilateur les mélange à chaque
  tirage. `fixed_last=n` garde les n derniers choix à la fin, dans ton ordre
  (pour « Aucune de ces réponses », par exemple). `shuffle=0` garde tous les
  choix dans ton ordre, quand cet ordre a un sens (« 1 », « 2 », « 3 »,
  « plus de 3 ») ; il ne se combine pas avec `fixed_last`.
- Deux choix ne doivent jamais avoir le même texte, pour aucun tirage : avec
  des choix calculés (erreurs types), vérifie qu’ils restent distincts, sinon
  la compilation est refusée.
- Sans `columns`, les choix sont empilés, tous de la largeur du plus long.
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

- Le bouton « Solution » remplit tous les champs avec leur solution, y compris
  ceux que l’élève avait justes. Pour une matrice, la solution est une `Matrix`
  ou une liste de lignes.
- Quand plusieurs réponses sont justes, marque les valeurs quelconques avec
  `ANY` : elles s’affichent « ∗ ». Exemple pour une matrice triangulaire :
  `solution_matrix = Matrix(n, n, lambda i, j: 0 if i > j else ANY)`.
- Le champ facultatif `question_solution_explanation` est affiché avec la
  solution, pour l’éclairer. Il s’écrit comme `question_statement` : HTML,
  formules entre `$…$`, valeurs `{{variable}}` de `question_setup` ; il ne
  contient aucun champ de saisie. Une explication qui demande un calcul (étapes
  d’un algorithme, dérivée de chaque terme) se prépare en texte dans
  `question_setup`, puis s’affiche avec `{{variable}}`.
- La solution doit être jugée juste : pour chaque tirage, le compilateur la
  saisit comme le ferait un élève (texte de la solution, `1` pour une valeur
  `ANY`, indices pour une question à choix), la corrige (par `question_check`, ou par
  comparaison sans `question_check`) et refuse la question si un champ est jugé faux, si
  `question_check` plante, ou si une solution texte est vide.

## Retour à l’élève

La variable `feedback` explique l’erreur sans donner la réponse : la réponse est le rôle du
bouton « Solution ». Par exemple « 6 est bien un diviseur commun, mais ce n’est
pas le plus grand » plutôt que « la réponse était 12 ».

Dans `feedback`, et dans une valeur `{{variable}}`, seules ces balises de mise en
forme sont interprétées, sans attribut : `<b>`, `<i>`, `<strong>`, `<em>`,
`<sup>`, `<sub>`, `<br>`. Tout autre HTML s’affiche tel quel.

N’invente pas de mises en page, de composants, d’API d’exécution ni de
bibliothèques Python. La seule mise en page prise en charge est `STD`.
N’utilise pas d’autres balises ou filtres Django. Si la question demandée
nécessite une fonctionnalité non prise en charge, signale-le séparément au lieu
de proposer une approximation silencieuse.

## Convertir une question AMC

On peut te donner une ou plusieurs questions écrites en LaTeX pour
auto-multiple-choice (AMC). Convertis chaque question en un fichier `.pwq` :

| AMC | `.pwq` |
|---|---|
| `\begin{question}` | `input_radio` |
| `\begin{questionmult}` | `input_checkbox` |
| texte avant `\begin{reponses}` | `question_statement`, avant la balise |
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
  (`\AMCOpen`), réponse numérique (`\AMCnumericChoices`), image, barème par
  réponse (`\bonne{…}\bareme{…}`), directive `formula`, `set.…`, `default.…`,
  `requires.…`, `auto`, `SUF`, `allowempty`. Signale-les séparément.
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
{% input_checkbox 'answer' choices=choices solution=correct columns=5 fixed_last=1 scoring='b=1,m=-0.5,p=0' %}
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
from pywims import py_wims, is_number

x = randint(10, 100)
y = randint(10, 100)
result = gcd(x, y)
%
% question_statement
%
Quel est le plus grand diviseur commun de ${{x}}$ et ${{y}}$ ?
{% input_text 'answer' solution=result style='width:5em' %}
%
% question_solution_explanation
%
${{result}}$ divise ${{x}}$ et ${{y}}$, et c’est le plus grand entier qui les divise tous les deux :
l’algorithme d’Euclide permet de le trouver.
%
% question_check
%
value = py_wims(answer)
ok_answer['answer'] = is_number(value) and value == result
if ok_answer['answer']:
    feedback = 'Bravo, c’est exact !'
elif is_number(value) and value != 0 and x % value == 0 and y % value == 0:
    feedback = 'C’est bien un diviseur commun, mais ce n’est pas le plus grand.'
else:
    feedback = 'Ce nombre ne divise pas les deux entiers.'
%
```
