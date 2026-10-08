# Prompt de génération des exercices PyWimsOnHTML

Tu rédiges un fichier source d’exercice pour PyWimsOnHTML. Réponds uniquement
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
Les champs sont, dans cet ordre : `title`, `keywords`, `layout`, `avant`,
`enonce` et `apres`. Ils sont obligatoires et non vides, sauf `apres`, qui est
facultatif (voir « Correction : avec ou sans `apres` »).
N’insère pas de ligne contenant uniquement `%` dans le contenu d’un champ.

Tout le contenu destiné à l’élève doit être en français, y compris le titre,
les mots-clés, l’énoncé et les messages de correction. Écris les mots-clés en
français, séparés par des virgules.

## Python

- Le code Python va dans `avant` (tirage aléatoire et calcul des solutions) et,
  s’il existe, dans `apres` (correction). `apres` voit toutes les variables de
  `avant`.
- Rien n’est importé d’office : commence `avant` par les imports nécessaires,
  par exemple `from random import randint, choice` et `from sympy import *`.
- Tire le hasard uniquement avec le module `random` (ou `numpy.random`) : le
  compilateur calcule 20 tirages avec des graines fixes, puis le navigateur
  rejoue le tirage affiché avec la même graine. Une autre source de hasard
  (heure, `secrets`, `numpy.random.default_rng()` sans graine…) rendrait le
  tirage impossible à reproduire : le compilateur exécute chaque graine deux
  fois et refuse l’exercice si les deux tirages diffèrent.
- Les outils PyWims s’importent depuis le module `pywims` :
  `from pywims import py_wims, is_nombre, math_expression, decimal_fr, LIBRE`.
  - `math_expression(saisie)` analyse une expression écrite par un élève
    (`2x`, `x^2`, `sqrt(2)`) avec une grammaire restreinte, sans exécuter de
    code, et renvoie une expression SymPy ou `None`. Utilise-la pour toute
    saisie qui peut contenir une expression.
  - `py_wims(saisie)` convertit une saisie simple (nombre, fraction) en objet
    SymPy, ou renvoie `None`.
  - `is_nombre(valeur)` indique si une valeur est un nombre.
  - `decimal_fr(nombre, chiffres)` écrit un nombre arrondi à `chiffres`
    décimales, avec une virgule et sans zéros finaux : `decimal_fr(sqrt(2), 2)`
    donne `"1,41"`, `decimal_fr(1.5, 2)` donne `"1,5"`. Utilise-le comme
    solution d’une réponse décimale en français.
- Toute chaîne Python qui contient une formule TeX s’écrit en **chaîne brute**,
  préfixée par `r` : `feedback = r'Simplifiez $\frac{6}{8}$ par $2$.'`, et non
  `'… $\frac{6}{8}$ …'`. Dans une chaîne ordinaire, Python transforme `\f`
  (de `\frac`), `\t` (de `\times`, `\text`), `\r` (de `\right`)… en caractères
  invisibles, et la formule s’affiche en erreur. C’est vrai pour `feedback`,
  `explication_solution`, les choix et toute autre chaîne ; pour une chaîne
  formatée, écris `rf'…'`. Le compilateur refuse une chaîne qui contient un
  tel caractère.
- Si tu écris `apres`, affecte `True` ou `False` à `ok_answer['nom_du_champ']`
  pour chaque champ. Pour une matrice, ajoute une entrée par case, nommée exactement
  `ok_answer["nom_du_champ[{}][{}]".format(i, j)]`.
- Définis aussi dans `apres` la variable `feedback`, le retour affiché à
  l’élève (formules TeX admises). Elle est facultative : sans elle, le retour
  est « Bravo, c’est exact ! », ou en cas d’erreur « Réponse incorrecte. »
  (une seule réponse attendue) ou « Certaines réponses sont incorrectes. ».

## Correction : avec ou sans `apres`

- **Sans `apres`**, l’élève doit donner ce qu’affiche le bouton « Solution » :
  chaque saisie est comparée à la solution du tirage, sans Python, ce qui rend
  l’exercice plus léger et plus rapide. Sont seulement ignorés les espaces, le
  signe moins typographique « − » et le codage des accents. Tout le reste
  compte : majuscules, ordre des termes (`1 + x^2` est faux pour `x^2 + 1`),
  fractions équivalentes (`14/24` est faux pour `7/12`), séparateur décimal
  (`0,5` est faux pour `0.5`).
- **N’écris pas `apres`** pour une question à choix corrigée en tout ou rien,
  ni pour un champ texte dont la réponse a une seule écriture (un entier, une
  fraction irréductible, un mot).
- **Écris `apres`** quand plusieurs écritures sont justes (expression dans un
  autre ordre, fraction non simplifiée, valeur approchée), pour un retour ciblé
  selon l’erreur, et toujours pour un champ `input_math` : une formule se
  corrige par une comparaison symbolique, par exemple
  `simplify(math_expression(saisie) - solution) == 0`.
- La solution s’affiche telle que SymPy l’écrit (`19/12`, `x^2 + 1`). Un
  flottant est arrondi à 12 chiffres significatifs et s’écrit avec un point
  (`0.1 + 0.2` donne `0.3`). Pour une réponse décimale écrite à la française,
  donne une solution texte avec `decimal_fr`.
- Un indice qui ne dépend pas de la réponse de l’élève va dans
  `explication_solution`, affichée avec la solution : il ne demande pas
  d’`apres`.

## Énoncé et champs de saisie

- Dans `enonce`, utilise `{{variable}}` pour afficher une valeur de `avant`.
  Dans une commande TeX, sépare la variable des accolades de TeX par des
  espaces : `\frac{ {{n}} }{ {{m}} }`, et non `\frac{{{n}}}{{{m}}}`.
  Les objets SymPy s’affichent en LaTeX. Écris les formules TeX avec `$...$`, `$$...$$`,
  `\(...\)` ou `\[...\]`. Le HTML est autorisé.
- Champs pris en charge ; `solution=` est obligatoire et désigne une variable
  de `avant` qui contient la bonne réponse :
  - `{% input_text 'nom' solution=variable style='CSS facultatif' %}`
  - `{% input_math 'nom' solution=variable %}` (saisie mathématique MathLive)
  - `{% input_matrix 'nom' size=n solution=variable input_style='CSS facultatif' %}`
    ou `{% input_matrix 'nom' rows=m cols=p solution=variable %}` ; chaque
    dimension est un entier ou une variable entière de `avant`, entre 1 et 10.
  - `{% input_vmatrix 'nom' max_rows=5 max_cols=5 solution=variable input_style='width:2em' %}` :
    matrice que l’élève redimensionne lui-même. Comme pour une matrice fixe,
    une case prend la taille de son champ (2em de large par défaut) ;
    `cell_width` et `cell_height` l’imposent si besoin.
  - `{% input_radio 'nom' choices=liste solution=indice %}` (choix unique) et
    `{% input_checkbox 'nom' choices=liste solution=indices %}` (choix
    multiple) : voir « Questions à choix » ci-dessous.
- Le nom d’un champ est aussi le nom de la variable Python qui reçoit la
  saisie dans `apres` (une chaîne, une liste de listes de chaînes pour une
  matrice, un indice ou une liste d’indices pour une question à choix). Il ne doit pas reprendre un nom de `avant`, ni `ok_answer`,
  `feedback`, `explication_solution`, un outil de `pywims` ou un mot-clé Python.

## Questions à choix

- `choices=` désigne une liste de `avant`, d’au moins deux choix, dans ton
  ordre. Un choix est un texte simple, où les formules TeX sont admises, en
  chaîne brute (`r"$\frac{1}{2}$"`), ou un objet SymPy, affiché comme une
  formule. Le HTML n’est pas interprété dans un choix.
- `solution=` désigne l’indice du bon choix (`input_radio`) ou la liste des
  indices des bons choix (`input_checkbox`), éventuellement vide. Les indices
  commencent à 0, dans l’ordre de `choices`.
- Ne mélange pas les choix toi-même : le compilateur les mélange à chaque
  tirage. `fixed_last=n` garde les n derniers choix à la fin, dans ton ordre
  (pour « Aucune de ces réponses », par exemple).
- `columns=n` (de 1 à 6) place les choix sur n colonnes sur grand écran ;
  réserve-le aux choix courts (nombres, formules brèves). Sur téléphone, les
  colonnes se réduisent d’elles-mêmes.
- Aucun choix n’est ajouté automatiquement : pour proposer « Aucune de ces
  réponses », écris-le comme dernier choix, avec `fixed_last=1`, et mets son
  indice dans la solution quand aucun autre choix n’est bon.
- Sans `apres`, la question est juste si les choix cochés sont exactement ceux
  de la solution. N’écris `apres` que pour un retour ciblé selon les choix
  cochés.
- Dans `apres`, le champ contient l’indice choisi (`input_radio`) ou la liste
  croissante des indices cochés (`input_checkbox`, `[]` si rien n’est coché),
  dans l’ordre de `choices`. Un choix multiple se corrige en tout ou rien :
  `ok_answer['nom'] = nom == sorted(bonnes)` (la saisie est triée ; `sorted`
  est inutile si `bonnes` l’est déjà). Le `feedback` peut expliquer l’erreur
  selon les choix cochés, sans donner la réponse.
- `bareme='…'` (facultatif) donne une note indicative selon la syntaxe d’AMC,
  par exemple `bareme='b=1,m=-0.5,p=0'` ou `bareme='mz=1'`. Directives admises :
  `b`, `m`, `v`, `e`, `d`, `p`, `P`, `mz`, `haut`, `MAX`. Un barème n’est admis
  que si le champ à choix est le seul champ de la question. Sans barème, aucune
  note n’est affichée.

## Solution

- Le bouton « Solution » remplit tous les champs avec leur solution, y compris
  ceux que l’élève avait justes. Pour une matrice, la solution est une `Matrix`
  ou une liste de lignes.
- Quand plusieurs réponses sont justes, marque les valeurs quelconques avec
  `LIBRE` : elles s’affichent « ∗ ». Exemple pour une matrice triangulaire :
  `solution_matrice = Matrix(n, n, lambda i, j: 0 if i > j else LIBRE)`.
- Tu peux définir dans `avant` une variable `explication_solution` (texte,
  formules TeX admises), affichée avec la solution pour l’éclairer.
- La solution doit être jugée juste : pour chaque tirage, le compilateur la
  saisit comme le ferait un élève (texte de la solution, `1` pour une valeur
  `LIBRE`, indices pour une question à choix), la corrige (par `apres`, ou par
  comparaison sans `apres`) et refuse l’exercice si un champ est jugé faux, si
  `apres` plante, ou si une solution texte est vide.

## Retour à l’élève

La variable `feedback` explique l’erreur sans donner la réponse : la réponse est le rôle du
bouton « Solution ». Par exemple « 6 est bien un diviseur commun, mais ce n’est
pas le plus grand » plutôt que « la réponse était 12 ».

N’invente pas de mises en page, de composants, d’API d’exécution ni de
bibliothèques Python. La seule mise en page prise en charge est `STD`.
N’utilise pas d’autres balises ou filtres Django. Si l’exercice demandé
nécessite une fonctionnalité non prise en charge, signale-le séparément au lieu
de proposer une approximation silencieuse.

## Convertir une question AMC

On peut te donner une ou plusieurs questions écrites en LaTeX pour
auto-multiple-choice (AMC). Convertis chaque question en un fichier `.pwq` :

| AMC | `.pwq` |
|---|---|
| `\begin{question}` | `input_radio` |
| `\begin{questionmult}` | `input_checkbox` |
| texte avant `\begin{reponses}` | `enonce`, avant la balise |
| `\bonne{…}`, `\mauvaise{…}` | la liste `choices` et les indices de `solution` |
| `\lastchoices` | `fixed_last` : nombre de choix qui le suivent |
| case « Aucune de ces réponses » ajoutée par l’option `completemulti` | un dernier choix écrit explicitement, avec `fixed_last=1`, juste quand aucun autre ne l’est |
| `reponseshoriz` | `columns` égal au nombre de choix, si les choix sont courts |
| `\explain{…}` | `explication_solution` dans `avant` |
| `\bareme{…}` | `bareme='…'`, recopié tel quel |
| `\baremeDefautS{…}`, `\baremeDefautM{…}` | recopiés dans le `bareme` de chaque question concernée, sauf si elle a son propre barème |
| `\FPeval`, macros de calcul, valeurs tirées au hasard | Python dans `avant`, avec `random` |
| identifiant de la question (`{premiers}`) | nom du fichier ; le nom du champ est un identifiant Python, par exemple `reponse` |
| `\AMCnoCompleteMulti`, `\scoring`, mise en page (`\vspace`, `\element`…) | ignorés |

- Transpose le texte de l’énoncé : `\textbf{…}` → `<b>…</b>`, `\emph{…}` et
  `\textit{…}` → `<i>…</i>`, `\og … \fg` → « … », `~` → espace, `\\` →
  `<br>`. Garde les formules `$…$` telles quelles. Dans un choix, le HTML
  n’est pas interprété : écris un texte simple.
- Un titre et des mots-clés en français sont obligatoires : déduis-les de la
  question.
- N’écris pas d’`apres` : AMC n’a pas de retour selon la réponse, et la
  correction sans `apres` vérifie déjà la réponse en tout ou rien. Écris-en un
  seulement si l’on te demande des retours ciblés ; il écrit alors un
  `feedback` utile, qui ne donne pas la réponse (voir
  `exercises/nombres-premiers.pwq`).
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
% title
%
Reconnaître des nombres premiers
%
% keywords
%
arithmétique, nombres premiers, QCM
%
% layout
%
STD
%
% avant
%
from random import sample
from sympy import isprime

nombres = sample(range(2, 50), 4)
choix = [f"${n}$" for n in nombres] + ["Aucun de ces nombres"]
bonnes = [i for i, n in enumerate(nombres) if isprime(n)]
if not bonnes:
    bonnes = [4]
explication_solution = "Un nombre premier a exactement deux diviseurs : $1$ et lui-même."
%
% enonce
%
Parmi les nombres suivants, lesquels sont <b>premiers</b> ?
{% input_checkbox 'reponse' choices=choix solution=bonnes columns=5 fixed_last=1 bareme='b=1,m=-0.5,p=0' %}
%
```

## Exemple

```text
%
% title
%
Plus grand diviseur commun
%
% keywords
%
arithmétique, PGCD, nombres entiers
%
% layout
%
STD
%
% avant
%
from random import randint
from sympy import gcd
from pywims import py_wims, is_nombre

x = randint(10, 100)
y = randint(10, 100)
resultat = gcd(x, y)
%
% enonce
%
Quel est le plus grand diviseur commun de ${{x}}$ et ${{y}}$ ?
{% input_text 'reponse' solution=resultat style='width:5em' %}
%
% apres
%
valeur = py_wims(reponse)
ok_answer['reponse'] = is_nombre(valeur) and valeur == resultat
if ok_answer['reponse']:
    feedback = 'Bravo, c’est exact !'
elif is_nombre(valeur) and valeur != 0 and x % valeur == 0 and y % valeur == 0:
    feedback = 'C’est bien un diviseur commun, mais ce n’est pas le plus grand.'
else:
    feedback = 'Ce nombre ne divise pas les deux entiers.'
%
```
