# Spécification — feuilles de questions et tirages précalculés

Ce document décrit PyWimsOnHTML tel qu’il est. Il sert de référence : une
modification commence par lui, avant le code (§ 9). Le pourquoi des choix, les
solutions écartées et leur histoire sont dans `DECISIONS.md`, sous les mêmes
numéros de section.

## 1. Objectifs

1. L’énoncé s’affiche dès l’ouverture du fichier, sans attendre Python.
2. Une question sans `question_check` se corrige sans Python, par comparaison avec sa
   solution (§ 2.6) : c’est le cas courant des questions à choix. Seules les
   questions qui ont un `question_check` chargent Pyodide, en arrière-plan, et leur
   correction par Python reste complète.
3. Une activité est une feuille de questions compacte dans une seule page :
   un seul chargement de Pyodide, MathJax et MathLive pour toutes les questions.
4. L’apparence suit la charte (§ 11.4) : la charte neutre `css/brand.css`, ou
   le `brand.css` du dossier de questions, y compris pour les activités.
5. L’élève travaille sur ordinateur comme sur téléphone : les deux usages
   comptent autant, et la page doit être confortable sur un petit écran tactile
   comme avec un clavier et une souris. Le fichier HTML reste unique et de taille
   raisonnable. Il faut une connexion pour la correction (bibliothèques en ligne).
6. Hors périmètre : le secret des réponses et la notation, qui exigeraient un
   serveur. Le pourcentage affiché mesure la progression de l’entraînement.
   Les solutions sont lisibles dans le code source de la page, et la note
   d’une question à barème n’est qu’indicative : un fichier généré sert à
   l’entraînement, jamais à une évaluation notée.

## 2. Format `.pwq`

L’extension signifie « PyWims question » : un fichier décrit une question,
et une activité en réunit plusieurs.

### 2.1 Champs

| Champ | Statut | Rôle |
|---|---|---|
| `question_title`, `question_keywords`, `question_layout` | obligatoire | titre, mots-clés (séparés par des virgules), mise en page (`STD`) |
| `question_setup` | obligatoire | tirage et calcul des solutions |
| `question_statement` | obligatoire | modèle de l’énoncé |
| `question_solution_explanation` | facultatif | explication affichée avec la solution (§ 5.2) : modèle Jinja écrit comme l’énoncé (§ 2.10), sans champ de réponse |
| `question_check` | facultatif | correction ; sans lui, chaque champ est corrigé par comparaison avec sa solution (§ 2.6) |
| `question_draws` | facultatif | nombre de tirages calculés à la compilation, entier de 1 à 200 ; 20 par défaut (§ 3) |

**Noms en anglais.** Tous les noms que l’auteur écrit sont en anglais, comme
Python et HTML : champs (préfixés par `question_`), outils de `pywims`
(`ANY`, `math_expression`, `mcq`, `tex`), attributs des champs (`scoring`), et noms des
exemples. Les anciens noms de PyWims (`avant`, `enonce`, `apres`, `tirages`,
`bareme`, `LIBRE`, `decimal_fr`, `is_nombre`, `explication_solution`) sont refusés comme
tout nom inconnu, ainsi que les outils retirés (`py_wims`, `decimal_comma`, `is_number`).

**Énoncé et explication** sont des modèles Jinja (§ 2.10) : HTML, formules,
valeurs `{{ … }}`, cas `{% if %}`, répétitions `{% for %}`. Le texte qui varie
d’un tirage à l’autre s’écrit dans le modèle, et non dans des chaînes Python
de `question_setup`.

**Signe « < » dans une formule.** L’énoncé et l’explication sont du HTML de
l’auteur : un `<` suivi d’une lettre y ouvre une balise. Dans une formule
(`$…$`, `$$…$$`, `\(…\)`, `\[…\]`) de l’énoncé rendu, valeurs comprises, le
`<` est donc échappé : `$x_1<x_2$` s’affiche comme on l’attend, au lieu
d’avaler la suite de l’énoncé. Hors formule, le HTML reste intact.

Le retour destiné à l’élève est la variable `feedback` de `question_check` (§ 2.2).
Les paquets Pyodide sont déduits des `import` du code. Un champ inconnu est
refusé.

### 2.2 Python

- Chaque question importe explicitement ce qu’elle utilise :
  `import sympy as sp`, `from sympy import …`, `import random`, etc.
- Les outils PyWims viennent d’un module dédié :
  `from pywims import math_expression, mcq, tex, ANY`
  (`mcq` : choix d’un QCM tirés au hasard, § 10.9 ; `tex` : écriture d’un
  nombre ou d’une expression dans une formule, § 2.10).
  Ses fonctions internes ne sont pas visibles par l’auteur, qui ne peut donc
  pas les perturber (par exemple en écrivant `E = 3`).
- `question_check` partage l’espace de noms de `question_setup` et y trouve les saisies de
  l’élève sous le nom de chaque champ : le texte saisi, sauf pour un champ à
  choix (indice, § 10.3) et pour `input_value` (valeur lue, § 2.8).
- Contrat de sortie de `question_check` : `ok_answer[nom_du_champ] = True/False` pour
  chaque champ (`"matrice[i][j]"` pour une case), pré-rempli par la correction
  par défaut (§ 2.6), et, facultativement, une
  variable `feedback` : un texte (formules TeX admises) qui explique l’erreur
  sans donner la réponse. Sans elle, le retour est générique : « Bravo, c’est
  exact ! », ou en cas d’erreur « Réponse incorrecte. » pour une question qui
  n’attend qu’une réponse (un seul champ texte, MathLive ou à choix unique),
  « Certaines réponses sont incorrectes. » sinon (plusieurs champs, choix
  multiple, matrice). Le texte est échappé, sauf quelques balises de mise en
  forme, sans attribut : `<b>`, `<i>`, `<strong>`, `<em>`, `<sup>`, `<sub>`,
  `<br>` ; un `x < 3` s’affiche donc tel quel, et aucune balise ne peut
  exécuter de script, même si le retour reprend la saisie de l’élève. Ses
  formules sont composées par MathJax.
- Pour lire une saisie qui contient une expression (champ texte ou case de
  matrice, champ MathLive, dont la saisie arrive en texte : `x^2+1`), utiliser
  `math_expression` : elle accepte l’écriture des élèves (`2x`, `x^2`, `sin x`, `ln(x)`) et renvoie `None` pour
  une saisie invalide. Elle s’appuie sur l’analyseur de SymPy (`parse_expr`,
  avec produit implicite et `^` pour la puissance), précédé d’un filtre : seuls
  les chiffres, les lettres, les espaces et `+ - * / ^ ( ) .` sont admis, et
  `//` est refusé. Sans `_`, guillemets, crochets ni virgule, une saisie ne
  peut appeler que les fonctions admises (`sin`, `cos`, `tan`, `exp`, `log`,
  `ln`, `sqrt`) ; les autres noms sont des symboles, et `e` et `pi` les
  constantes.
- **`math_expression` ne calcule rien** : l’expression renvoyée est celle que
  l’élève a écrite, ce qui permet d’en vérifier la forme (fraction
  irréductible, forme factorisée…). Deux comparaisons, à ne pas confondre :
  - `math_expression(saisie) == solution` : même écriture, **à l’ordre des
    termes et des facteurs près** (`3x^2+2x`, `2x+3x^2` et `x*2+3x^2` sont
    égales à `3*x**2 + 2*x`) ; seule la notation est ignorée : produit
    implicite, `^`, `e^x` pour `exp(x)`, parenthèses d’une somme ou d’un
    produit, `x - 1` et `x/2` comme SymPy les représente, fraction d’entiers
    déjà irréductible (`3/4` est `Rational(3, 4)`). Tout ce qui demande un
    calcul donne une expression différente : `6/8` n’est pas `3/4`, ni `3/(-4)`
    `-3/4`, ni `sqrt(4)` `2`, ni `sin(pi)` `0`, ni `x+x` `2x`, ni `2(x+1)`
    `2x + 2`, ni `1.5` `3/2`.
  - `simplify(math_expression(saisie) - solution) == 0` : **même valeur**,
    quelle que soit l’écriture.

  La solution de l’auteur, écrite en Python, est calculée par SymPy :
  `2*(x+1)` y devient `2*x + 2`. Pour exiger une forme, l’auteur la décrit avec
  `math_expression` des deux côtés : `math_expression(saisie) ==
  math_expression('2(x+1)')`.

### 2.3 Champs de réponse

Un champ s’écrit dans l’énoncé comme un appel de fonction entre `{{ }}` : son
nom entre guillemets, puis ses attributs `nom=valeur`, séparés par des
virgules. Il porte obligatoirement `solution=variable`, le nom d’une variable
définie par `question_setup` :

```
{{ input_text('result', solution=total, style='width:7em') }}
{{ input_text('word', solution=noun, match='loose') }}
{{ input_text('verb', solution=form, inline=true) }}
{{ input_value('length', solution=hypotenuse, tolerance=0.01, form='decimal') }}
{{ input_math('student_derivative', solution=derivative) }}
{{ input_matrix('matrix', rows=m, cols=p, solution=product, input_style='width:2em') }}
{{ input_vmatrix('matrix', max_rows=5, max_cols=5, solution=product) }}
{{ input_radio('answer', choices=choices, solution=correct) }}
{{ input_checkbox('answers', choices=choices, solution=correct, columns=2) }}
{{ input_select('verb', choices=forms, solution=correct) }}
```

- **Lu sans Python.** L’écriture est celle d’un appel, mais le champ n’est pas
  évalué : la page doit connaître ses champs sans Python (§ 1). Une valeur est
  un nombre, un texte entre guillemets, un booléen, ou un **nom** de variable
  (`solution=total`), jamais une expression (`solution=p * 2` est refusé :
  calculez la valeur dans `question_setup`). Les mots d’une liste
  (`form`, `match`) s’écrivent avec ou sans guillemets.
- **Booléens.** Un attribut oui ou non (`shuffle`, `inline`) vaut `true` ou
  `false`, écrits aussi `True` et `False`, comme en Jinja ; toute autre valeur
  est refusée, avec un message qui le dit. Un attribut booléen s’écrit toujours
  avec sa valeur : `inline=true`, jamais `inline` seul.
- **Un champ par tirage, toujours le même.** Un champ ne peut pas être placé
  dans un `{% if %}` ni dans un `{% for %}` : correction, contrôles et
  `question_check` supposent les mêmes champs pour tous les tirages. Le
  compilateur le vérifie sur l’énoncé rendu de chaque tirage : chaque champ y
  apparaît exactement une fois. Pour adapter une question au tirage, on change
  le texte autour du champ, pas le champ. Deux champs ne portent jamais le
  même nom (la saisie arrive dans la variable de ce nom).
- **Ancienne notation.** `{% input_value 'n' solution=s %}` est refusé, avec
  un message qui donne la nouvelle écriture ; de même `shuffle=0` et
  `shuffle=1` (« `shuffle=0` s’écrit maintenant `shuffle=false` »).

**Noms.** Un nom de champ ou de variable (`solution=`, `choices=`, `rows=`…)
suit la règle des identifiants de Python : lettres, accentuées
comprises (`résultat`, `Δx`), chiffres et `_`, sans chiffre en tête. Comme
Python, la page ramène chaque nom à sa forme NFKC : un « é » écrit en deux
caractères (e suivi de l’accent) désigne la même variable que « é ».

Les questions à choix (`input_radio`, `input_checkbox`) sont décrites au § 10,
les valeurs numériques (`input_value`) au § 2.8, les listes déroulantes d’un
texte à trous (`input_select`) au § 2.9.

**Conversion de la solution.** À la compilation, pour chaque tirage, la
valeur Python de la variable de solution (calculée par `question_setup`) est convertie
en la valeur que le bouton « Correction » écrit dans le champ. Cette valeur
convertie est enregistrée dans le tirage (`solutions`, § 3) ; le navigateur
n’a pas besoin de Python pour l’afficher.

| Champ | Valeur Python (entrée) | Valeur écrite dans le champ (sortie) |
|---|---|---|
| `input_text` | nombre, expression SymPy ou texte | le texte qu’un élève taperait : `Rational(19, 12)` → `19/12`, `x**2 + 1` → `x^2 + 1`, `'oui'` → `oui` |
| `input_value` | nombre Python ou SymPy | le nombre, écrit selon `form` (§ 2.8) : `Rational(3, 2)` → `3/2` ou `1,5` |
| `input_math` | expression SymPy | son code LaTeX, affiché par MathLive : `Rational(19, 12)` → `\frac{19}{12}` |
| `input_matrix` | `Matrix` ou liste de lignes | un texte par case, converti comme pour `input_text` |
| `input_vmatrix` | idem | idem ; la grille prend les dimensions de la solution |
| `input_radio`, `input_checkbox` | indice, ou liste d’indices | les choix correspondants sont cochés (§ 10) |

Quand plusieurs réponses sont justes, une valeur peut être déclarée libre avec
`ANY` (fourni par `pywims`), y compris dans une `Matrix` :

```python
from pywims import ANY
solution = Matrix(n, n, lambda i, j: 0 if i > j else ANY)
```

Une case libre affiche « ∗ » dans un style neutre (bordure en pointillés,
sans couleur de correction).

**Clavier des téléphones.** Un champ `input_text` et une case de matrice
reçoivent ce que l’élève tape, tel quel :
- `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` : sans
  eux, un iPhone met une majuscule au premier caractère (`x+1` devient `X+1`,
  jugé faux car les majuscules comptent, § 2.6), et la correction automatique
  peut remplacer un mot ;
- clavier texte complet (`inputmode="text"`), y compris pour les cases de
  matrice : le pavé décimal de l’iPhone n’a ni signe moins, ni barre de
  fraction, ni lettre.

Les champs MathLive ont leur propre clavier virtuel et ne sont pas concernés.

**Dans une phrase : `inline=true`.** Un champ `input_text` ou `input_value`
placé au milieu d’une phrase (texte à trous) prend, avec `inline=true`,
l’aspect de la liste `inline=true` (§ 2.9) : cadre fin en pointillé, de la
hauteur de la ligne, aux coins à peine arrondis, fond transparent ; la saisie
s’écrit dans la couleur, la police et la taille du texte, sans italique.
Après vérification, le cadre devient transparent (rien ne bouge) et il ne
reste que le fond du verdict, sous la saisie de la couleur du verdict. La largeur ne suit pas la saisie, contrairement
à la liste : un champ qui s’élargit à chaque caractère ferait bouger la fin
de la phrase pendant la frappe ; elle reste celle d’un champ (8 em, ou
`style='width:…'`). Par défaut (`inline=false`), le champ garde son cadre
plein. `input_math` n’a pas cet attribut : ses boutons de clavier et de menu
l’élargissent trop pour une phrase.

### 2.4 Contrôles à la compilation

Le compilateur refuse la question, avec un message précis, si :
- un champ n’a pas de `solution=` ou désigne une variable absente ;
- un champ est écrit dans l’ancienne notation `{% input_… %}`, ou n’apparaît
  pas exactement une fois dans l’énoncé rendu d’un tirage (§ 2.3) ;
- le modèle Jinja de l’énoncé ou de l’explication est invalide, utilise une
  variable que `question_setup` ne définit pas, ou lève une erreur au rendu
  d’un tirage (le champ, la ligne du modèle et la graine sont indiqués) ;
- l’énoncé ou l’explication contient trois accolades de suite
  (`\frac{{{n}}}{2}`) : Jinja y lirait `{{` suivi de `{n}`, une erreur
  incompréhensible ; le message dit d’écrire `\frac{ {{n}} }{2}` ;
- la solution n’a pas la forme attendue par le champ (dimensions de matrice) ;
- un nom de champ est déjà défini par `question_setup`, ou réservé (`ok_answer`,
  `feedback`, noms du module `pywims`, mots-clés Python) ;
- une chaîne de `question_setup` ou de `question_check` contient un caractère de contrôle autre
  que le retour à la ligne : c’est presque toujours une formule TeX écrite dans
  une chaîne ordinaire (`'\frac'` contient un saut de page, `'\times'` une
  tabulation), qu’il faut écrire en chaîne brute `r'…'` (le champ et la ligne
  sont indiqués) ;
- `question_setup` lève une exception pour l’un des tirages (la graine est indiquée) ;
- la question est incohérente pour l’un des tirages : la solution, saisie comme
  par un élève, est jugée fausse par `question_check`, ou `question_check` lève une exception
  (§ 3, « Cohérence ») ;
- une question à choix ne respecte pas les règles du § 10.6.

### 2.5 Exemple

```
%
% question_title
%
Dérivée d’un polynôme
%
% question_keywords
%
dérivée, fonction polynomiale, calcul différentiel
%
% question_layout
%
STD
%
% question_setup
%
from random import choice, randint
from sympy import symbols, expand, diff, simplify
from pywims import math_expression

x = symbols("x")
a = choice([-4, -3, -2, -1, 1, 2, 3, 4])
b, c, d = randint(-5, 5), randint(-5, 5), randint(-5, 5)
function = expand(a*x**3 + b*x**2 + c*x + d)
derivative = diff(function, x)
%
% question_statement
%
Soit la fonction polynomiale $f(x) = {{ function }}$.
Donnez sa dérivée $f'(x)$ :
{{ input_math('student_derivative', solution=derivative) }}
%
% question_solution_explanation
%
On dérive terme à terme avec $(x^n)' = n\,x^{n-1}$ : $f'(x) = {{ derivative }}$.
%
% question_check
%
answer = math_expression(student_derivative)
ok_answer["student_derivative"] = answer is not None and simplify(answer - derivative) == 0
if ok_answer["student_derivative"]:
    feedback = "Bravo, cette dérivée est correcte !"
else:
    feedback = r"Ce n’est pas la bonne dérivée. Dérivez terme à terme avec $(x^n)' = n\,x^{n-1}$."
%
```

Le retour explique l’erreur sans donner la réponse : c’est le rôle du bouton
« Correction ».

### 2.6 Correction par défaut

Chaque champ désigne sa solution : `question_check` est facultatif. Sans lui, chaque
saisie est comparée à la solution du tirage, en JavaScript, sans Python.
`question_check` ne sert qu’aux corrections particulières (plusieurs écritures justes
d’une expression, formule) et aux retours ciblés ; une valeur numérique,
même approchée, se corrige avec `input_value` (§ 2.8).

**Principe : sans `question_check`, l’élève doit donner ce qu’affiche le bouton
« Correction ».** L’auteur le vérifie dans l’aperçu du compilateur.

- **Avec `question_check`** : `ok_answer` est pré-rempli par la correction par
  défaut, champ par champ (case par case pour une matrice), et `question_check`
  le change là où il veut juger autrement. L’auteur n’écrit donc que ce qui
  diffère de la correction par défaut : le retour ciblé, ou le verdict d’un
  champ qui admet plusieurs écritures. `input_math`, sans correction par
  défaut, n’est pas pré-rempli : sans affectation, il est faux. Conséquences :
  un `if …: ok_answer['x'] = True` sans `else` laisse, sinon, le verdict par
  défaut ; et le compilateur ne voit plus un champ oublié dans
  `question_check`, puisque son verdict par défaut est juste pour la solution.
- **Python** n’est chargé que par les questions qui ont un `question_check` (§ 5.1).

| Champ | Saisie juste si |
|---|---|
| `input_radio` | le choix est celui de la solution |
| `input_checkbox` | les cases cochées sont exactement celles de la solution |
| futur glisser-déposer | chaque élément est à la place de la solution |
| `input_text`, case de matrice | le texte saisi est celui de la solution (§ 2.3), aux différences typographiques près (ci-dessous) ; `match` règle cette tolérance |
| `input_value` | la valeur saisie est à `tolerance` près celle de la solution, et écrite sous la forme `form` (§ 2.8) |
| `input_vmatrix` | la grille a les dimensions de la solution, et chaque case est juste ; avec d’autres dimensions, toutes les cases sont fausses |
| valeur `ANY` | la saisie n’est pas vide |
| `input_math` | pas de correction par défaut : `question_check` est obligatoire (ci-dessous) |

Les questions à choix (et plus tard le glisser-déposer) sont le cas principal
sans `question_check` : la comparaison y est sans ambiguïté.

- **Différences typographiques ignorées** pour un champ texte : les espaces
  (`x^2+1` est juste pour `x^2 + 1`, `1 000` pour `1000`), le signe moins
  typographique « − » (U+2212, fréquent sur téléphone et dans les
  copier-coller) et le codage des accents (forme NFC : un « é » en un ou deux
  caractères). Tout le reste compte : majuscules (`A` et `a` sont deux objets
  mathématiques), ordre des termes (`1 + x^2` est faux pour `x^2 + 1`),
  fractions équivalentes (`14/24` pour `7/12`), séparateur décimal.
- **Degré de conformité d’un champ texte** (`match`, facultatif) :
  - `match=normal` (par défaut) : les différences typographiques ci-dessus ;
  - `match=exact` : caractère pour caractère, aux espaces de début et de fin
    près (une écriture imposée, par exemple `1 000` avec son espace) ;
  - `match=loose` : en plus, ni les majuscules, ni les accents, ni la
    ponctuation finale ne comptent (`Theoreme de Pythagore.` est juste pour
    `théorème de Pythagore`) : pour un mot ou un nom, où l’orthographe des
    accents n’est pas ce qu’on évalue.
- **Séparateur décimal.** Aucune équivalence entre la virgule et le point : en
  anglais la virgule sépare les milliers, et en mathématiques elle sépare des
  éléments (`(1, 5)` n’est pas `(1.5)`). L’élève écrit le séparateur que montre
  la solution. Un flottant s’affiche comme Python l’écrit (`0.3`), après
  arrondi à 12 chiffres significatifs, qui efface les artefacts de calcul
  (`0.1 + 0.2` donne `0.3`, et non `0.30000000000000004`). Un nombre attendu
  en écriture française se demande avec `input_value` (§ 2.8), qui accepte la
  virgule et le point.
- **Plusieurs écritures justes** : pour un nombre (fraction non simplifiée,
  valeur approchée, virgule ou point), `input_value` (§ 2.8) ; pour une
  expression (ordre des termes), l’auteur écrit `question_check`. `PROMPT.md`
  le dit.
- **Retour.** Le texte générique du § 2.2 (« Réponse incorrecte. » pour une
  question qui n’attend qu’une réponse). Un indice qui ne dépend pas de la
  réponse de l’élève peut aller dans `question_solution_explanation`,
  affichée avec la solution.
- **`input_math` exige un `question_check`**, et le compilateur le dit. Une
  formule ne se compare pas à l’écriture de sa solution, que SymPy choisit
  (`(x+1)/2` devient `x/2 + 1/2`), et l’enseignant attend presque toujours une
  expression égale, pas une écriture : c’est une comparaison symbolique, donc
  Python.
- **Code partagé.** Les règles sont dans `runtime/correction.js`, intégré au
  fichier généré et utilisé aussi par le compilateur pour le contrôle de
  cohérence (§ 3) : la solution doit être jugée juste par la correction par
  défaut, ce qui vérifie notamment la normalisation. Une solution texte vide
  (ou faite d’espaces) est refusée : l’élève ne pourrait pas la saisir, car
  « Vérifier » reste inactif tant qu’aucun champ n’est rempli.

### 2.7 Images

Une question qui montre une figure est une **archive** : un fichier `.pwqa`
(« PyWims question archive »), ou `.zip`, qui contient exactement un fichier
`.pwq` et ses images, à la racine de l’archive. Le fichier compilé reste une
page unique et autonome : le compilateur y intègre chaque image.

- **Écriture.** Dans l’énoncé ou l’explication, `<img src="figure.png"
  alt="…">` désigne une image de l’archive par son nom. Les images de
  `question_setup` (graphiques calculés) sont un autre chantier (§ 12).
- **Intégration.** À la lecture de l’archive, chaque `src` qui nomme une image
  de l’archive est remplacé par l’image elle-même (adresse `data:`), dans le
  texte du `.pwq`. Le reste du compilateur (aperçu, tirages, assemblage) ne
  voit qu’un `.pwq` ordinaire, et « Relire » voit aussi une image modifiée.
- **Affichage.** Une image n’est jamais plus large que l’énoncé : sur
  téléphone, elle est réduite, sans défilement horizontal.
- **Formats** : PNG, JPEG, GIF, SVG, WebP, d’après l’extension. Une image SVG
  est affichée par `<img>`, qui n’exécute aucun script.
- **Liste.** Une archive est listée comme une question, sous le titre de son
  `.pwq` ; son chemin est celui de l’archive. Un `.zip` sans `.pwq` n’est pas
  une question : il est ignoré sans message (un dossier de questions peut
  contenir d’autres archives). Un `.pwqa` sans `.pwq`, ou une archive à
  plusieurs `.pwq`, est un fichier illisible, avec son explication.
- **Dossier dans l’archive.** Compresser un dossier (plutôt que ses fichiers)
  met tout dans un dossier de l’archive : s’il est seul, il est ignoré. Les
  fichiers ajoutés par macOS (`__MACOSX/`, `.DS_Store`) sont ignorés.
- **Contrôles.** Une image `src` relative absente de l’archive est une erreur,
  qui nomme l’image ; dans un `.pwq` seul, l’erreur rappelle de faire une
  archive. Une adresse complète (`https://…`, `data:`) est laissée telle
  quelle : c’est le choix de l’auteur, et la page dépend alors du réseau. Une
  image de plus de 300 Ko donne un **avertissement** : chaque image alourdit
  la page de toute sa taille (un tiers de plus en `data:`), et une photo se
  réduit sans perte visible.
- **Décompression** : par le navigateur (`DecompressionStream`), sans
  bibliothèque ; les archives compressées (« deflate ») et non compressées sont
  lues. Une archive chiffrée ou au format ZIP64 est refusée.

### 2.8 Valeurs numériques

`input_value` attend un nombre, comparé à la solution par sa valeur, sans
Python : la réponse numérique est le cas le plus courant, et ni la virgule de
l’écriture française, ni une valeur approchée, ni une fraction non simplifiée
n’exigent plus un `question_check`.

```
{{ input_value('length', solution=hypotenuse, tolerance=0.01, form='decimal') }}
```

| Attribut | Statut | Rôle |
|---|---|---|
| `solution` | obligatoire | nombre Python (`int`, `float`, `Fraction`) ou SymPy (`Rational`, `sqrt(2)`, `pi`…) |
| `tolerance` | facultatif | écart absolu admis, nombre décimal positif ; 0 par défaut : la valeur exacte |
| `form` | facultatif | écriture exigée (ci-dessous) ; `any` par défaut |
| `style` | facultatif | CSS du champ, comme pour `input_text` |
| `inline` | facultatif | `inline=true` : aspect fondu dans la phrase (§ 2.3), comme pour `input_text` |

| `form` | Écriture acceptée | Solution affichée |
|---|---|---|
| `any` | toutes celles-ci | entier, sinon décimal, sinon fraction irréductible |
| `integer` | entier : `-12` | `-12` |
| `decimal` | décimal (ou entier) : `1,5`, `1.5` | `1,5` |
| `fraction` | fraction d’entiers (ou entier) : `6/4` | `3/2` |
| `irreducible` | fraction irréductible (ou entier) : `3/2`, pas `6/4` | `3/2` |
| `scientific` | `m×10^n` ou `m e n`, avec 1 ≤ \|m\| < 10 : `1,5×10^3`, `1.5e3` | `1,5×10^3` |
| `percent` | pourcentage, entier ou décimal suivi de `%` : `42 %`, `12,5%` pour 0,42 et 0,125 | `42 %` |

- **Lecture de la saisie.** La virgule et le point sont acceptés : un nombre
  seul est sans ambiguïté, contrairement à un texte (§ 2.6). Les espaces sont
  ignorés (`1 000`), comme le signe moins typographique. Un pourcentage est
  un nombre : `42 %` vaut 0,42, juste avec `form=any` ; `form=percent`
  l’exige, les autres formes le refusent comme une mauvaise forme. La
  solution reste la valeur (0,42) ; la tolérance porte sur elle. Le multiplié de la
  notation scientifique s’écrit `×`, `*`, `x`, `·`, un point (`7,7.10^4`,
  écriture française) ou une simple espace (`7,7 10^4`).
- **Comparaison exacte.** Saisie, solution et tolérance sont des fractions
  exactes (entiers de taille quelconque, `BigInt`) : `0,1 + 0,2` n’a pas
  d’erreur d’arrondi. Un flottant de Python est d’abord arrondi à 12 chiffres
  significatifs, comme au § 2.6. Un nombre irrationnel (`sqrt(2)`, `pi`) est
  pris avec 30 chiffres significatifs ; il exige une tolérance non nulle.
- **Bonne valeur, mauvaise forme.** Le champ est faux, et le retour le dit :
  « La valeur est juste, mais elle doit être écrite sous forme décimale. »
  (de même « d’entier », « de fraction », « de fraction irréductible », « en
  notation scientifique », « en pourcentage »). L’élève sait ainsi ce qui reste à corriger. Une
  valeur fausse reçoit le retour générique (§ 2.2).
- **Solution affichée.** Écrite avec une virgule, dans la forme demandée.
  Quand la solution ne s’écrit pas exactement ainsi (`1/3` en décimal, `sqrt(2)`),
  elle est arrondie au nombre de décimales que permet la tolérance (la moitié
  d’une unité du dernier chiffre ne dépasse pas la tolérance) : `tolerance=0.01`
  affiche `0,33`. L’arrondi se fait au plus proche, les demis vers le haut,
  comme en classe. La solution s’écrit donc **exacte**, avec la tolérance de
  l’arrondi demandé (`tolerance=0.005` pour le centième), sans l’arrondir dans
  `question_setup` : il n’y a pas d’outil d’arrondi dans `pywims`. Seule une
  valeur arrondie qui sert ensuite à un calcul (propagation d’un arrondi) se
  calcule dans la question.
- **Contrôles à la compilation** (§ 2.4), pour chaque tirage : la solution est
  un nombre réel (ni texte, ni booléen, ni matrice ; `ANY` reste admis) ; un
  irrationnel, ou un décimal infini avec `form=decimal` ou `scientific`, a une
  tolérance non nulle ; une fraction est demandée pour une solution
  rationnelle ; et, comme pour tout champ, la solution affichée est jugée juste
  (§ 3, « Cohérence »).
- **Avec `question_check`**, qui ne sert alors qu’au retour ciblé selon l’erreur
  (« tu as oublié de retirer P(A ∩ B) »), le moteur lit la saisie avant de
  lancer Python, avec les règles ci-dessus, et `question_check` reçoit :

  | Nom | Contenu | Pour `14/40`, `form=irreducible`, solution `7/20` |
  |---|---|---|
  | `nom` | la valeur exacte, `Rational` de SymPy (`Integer` pour un entier), ou `None` si la saisie n’est pas un nombre | `Rational(7, 20)` |
  | `ok_answer['nom']` | pré-rempli par le verdict de la correction par défaut (tolérance et forme, § 2.6) ; `question_check` peut le changer | `False` |

  `question_check` compare donc des nombres (`nom == pa + pb`,
  `abs(nom - solution) <= 0.01`), sans relire le texte. Si `question_check` ne
  définit pas `feedback`, le retour est celui de la correction par défaut, y
  compris « La valeur est juste, mais… » pour un champ resté faux à cause de
  sa forme : l’auteur n’écrit que les erreurs qu’il veut repérer.
  Un seul lecteur de nombres, celui de la correction par défaut
  (`runtime/correction.js`), sert ainsi à l’élève, au compilateur (§ 3,
  « Cohérence ») et à `question_check`.

### 2.9 Liste déroulante : `input_select`

Une liste déroulante, à côté d’autres champs (« $X$ suit une loi
{{ input_select('law', choices=laws, solution=k) }} ») ou dans une phrase,
pour un texte à trous (« La fonction est
{{ input_select('sense', choices=senses, solution=correct, inline=true) }} sur
$[0 ; +\infty[$. »).

```
{{ input_select('verb', choices=forms, solution=correct, shuffle=false) }}
```

| Attribut | Statut | Rôle |
|---|---|---|
| `choices` | obligatoire | liste de `question_setup` : au moins deux choix, en texte simple |
| `solution` | obligatoire | indice du bon choix |
| `inline` | facultatif | `inline=true` : aspect fondu dans la phrase ; par défaut `false`, aspect d’un champ |
| `shuffle` | facultatif | `shuffle=false` garde l’ordre de l’auteur (§ 10.2) |
| `fixed_last` | facultatif | nombre de derniers choix non mélangés (§ 10.2) |

- **Aspect par défaut : un champ.** La liste a l’aspect d’un champ
  `input_value` : même cadre, même police, mêmes couleurs de verdict ; une
  petite flèche « ▾ », dans le cadre à droite, la distingue d’un champ où l’on
  tape. Vide, elle montre « *choisir* », en gris et en italique. Sa largeur
  est celle du plus long texte (choix ou « choisir »), mesurée par le script
  (la largeur naturelle d’un `<select>` laissait, sous Firefox, un choix en
  italique toucher la flèche) : la phrase ne bouge pas quand on choisit. Sa
  police est celle du navigateur, comme pour un champ texte, et elle a sa
  hauteur. Après vérification, la flèche disparaît : on ne peut plus choisir.
- **Aspect `inline=true` : dans la phrase.** Un cadre fin en pointillé, de la
  hauteur de la ligne, aux coins à peine arrondis, avec la flèche « ▾ »
  discrète après le texte. Vide, il montre « *choisir* », en gris et en
  italique. Rempli, le choix s’écrit dans la couleur, la police et la taille du
  texte, et le champ prend la largeur du choix : la suite de la phrase se
  décale, ce qu’on accepte pour que le texte rempli se lise comme une phrase
  ordinaire. Après vérification, le cadre et la flèche disparaissent (le cadre
  devient transparent : rien ne bouge) ; il ne reste que le fond du verdict,
  sous le texte de la couleur du verdict.
- **Largeur (`inline=true`).** Un `<select>` natif a toujours la largeur de
  son plus long choix ; le script mesure donc le texte affiché (« choisir » ou
  le choix) et règle la largeur à chaque changement, y compris quand
  « Correction » remplit le champ.
- **Saisie.** C’est un `<select>` natif : sur téléphone, le sélecteur du
  système s’ouvre, plus facile au doigt qu’une liste dessinée par la page ; au
  clavier, il se manie comme tout champ. Le champ compte comme rempli dès
  qu’un choix est fait.
- **Choix en texte simple.** Une option de liste n’affiche ni HTML ni formule :
  un choix qui contient `$` ou `\(` est refusé à la compilation ; un objet
  SymPy s’écrit comme dans un champ texte (`x^2 + 1`).
- **Mélange et tirages** : comme pour les questions à choix (§ 10.2), y
  compris `shuffle=false` et le refus de deux choix de même texte (§ 10.6).
  `mcq` (§ 10.9) peut tirer les choix.
- **Correction** : sans Python, le choix est juste s’il est celui de la
  solution ; `question_check` reçoit l’indice choisi dans l’ordre de
  l’auteur, ou `None`. Pas de barème : une liste est un trou parmi d’autres.
- **Correction** : le bon choix est sélectionné, en vert.

### 2.10 Modèles : Jinja

L’énoncé et l’explication sont des modèles **Jinja 2** (version de Pyodide,
3.1), rendus par Python **à la compilation**, pour chaque tirage, avec
l’espace de noms de `question_setup` : ses variables, ses fonctions et ce
qu’il importe. La page reçoit l’énoncé rendu de chaque tirage ; elle n’exécute
jamais Jinja et n’a pas besoin de Python pour l’afficher (§ 1).

```
{% if kind == "exactly" %}
Quelle est la probabilité qu’exactement {{ k }} photons traversent le polariseur ?
{% else %}
Quelle est la probabilité qu’au moins un photon traverse le polariseur ?
{% endif %}
$\mathcal{B}\left({{ n }}, {{ p }}\right)$, $p \approx {{ p|dec(2) }}$.
$$\mathbb{P}(X = k) = {{ value|frac }}$$
```

- **Tout Jinja** est admis : `{{ expression }}`, `{% if %}`, `{% for %}`,
  `{% set %}`, macros, filtres, commentaires `{# … #}`, sauf les champs dans
  un `{% if %}` ou un `{% for %}` (§ 2.3). Jinja ne voit pas d’autre fonction
  de Python que les siennes (`range`, filtres `length`, `join`, `round`…) :
  une fonction utile se définit ou s’importe dans `question_setup`.
- **Variable absente** : erreur à la compilation (`StrictUndefined` de Jinja),
  au lieu d’un texte vide.
- **Valeurs insérées telles quelles**, sans échappement : une valeur, une
  macro ou une boucle peut produire du HTML. Seul le `<` des formules est
  échappé, sur l’énoncé rendu (§ 2.1). Le texte de l’élève n’entre jamais dans
  un modèle : il ne paraît que dans un retour, échappé (§ 2.2).
- **Accolades de TeX** : `{{` ouvre toujours une valeur Jinja. On écrit
  `x^{ {{n}} }` (espaces), et non `x^{{{n}}}`, que le compilateur refuse
  (§ 2.4). Un `{#` de TeX ouvrirait un commentaire Jinja.

**Écriture d’une valeur : `tex`.** Chaque `{{ valeur }}` est écrite par
l’outil `tex` de `pywims`, celui que `question_setup` appelle aussi pour
fabriquer un texte (les choix d’un QCM sont des listes Python, § 10.1) :

| Valeur | `{{ v }}`, `tex(v)` | `{{ v\|frac }}`, `tex(v, frac=True)` | `{{ v\|dec }}`, `tex(v, dec=True)` | `{{ v\|dec(2) }}`, `tex(v, digits=2)` |
|---|---|---|---|---|
| `Rational(9, 10)`, `Fraction(9, 10)` | `9/10` | `\frac{9}{10}` | `0{,}9` | `0{,}90` |
| `Rational(1, 3)` | `1/3` | `\frac{1}{3}` | `1/3` (pas de décimal fini) | `0{,}33` |
| `-Rational(3, 4)` | `-3/4` | `-\frac{3}{4}` | `-0{,}75` | `-0{,}75` |
| `3` | `3` | `3` | `3` | `3{,}00` |
| `0.1 + 0.2` | `0.3` | `0.3` | `0{,}3` | `0{,}30` |
| `sqrt(2)` | `\sqrt{2}` | `\sqrt{2}` | refusé | `1{,}41` |
| `x**2/2 + 1` | `x^{2} / 2 + 1` | `\frac{x^{2}}{2} + 1` | refusé | refusé |
| `Matrix(…)` | entre crochets | idem | refusé | refusé |
| texte | tel quel | tel quel | refusé | refusé |

- **Fractions en ligne par défaut** (`a/b`), lisibles dans le texte et dans
  une formule `$…$`. `|frac` les écrit en grand, pour une formule centrée
  `$$…$$` ou un `$\displaystyle …$`. Une expression SymPy suit la même règle
  (`fold_short_frac` de `latex`) ; ses autres écritures sont celles de
  `sympy.latex`, que `tex` appelle.
- **Décimal à la française** : `|dec` écrit un décimal fini avec la virgule
  `{,}` de TeX (MathJax met sinon une espace après une virgule), et laisse les
  autres nombres en fraction, sans zéro final ; `|dec(n)` arrondit à n
  décimales, au plus proche, demis vers le haut (`round` de Python arrondit
  les demis au pair), et en écrit toujours n : `≈ 0{,}50`, l’écriture disant
  la précision de l’arrondi (le bouton « Correction » d’un `input_value`, lui,
  n’écrit pas de zéro final, § 2.8).
  `{,}` ne vaut que dans une formule : `|dec` s’écrit entre `$`.
- **Flottant** : 12 chiffres significatifs, avec un point (§ 2.6).
- **Refus** : une option impossible (`|dec` sur un texte ou une expression)
  arrête la compilation, avec le nom du champ du modèle et la ligne.

## 3. Compilation

- Le compilateur charge Pyodide (version **0.27.7**, la même que le fichier
  généré, pour que le rendu LaTeX soit identique).
- Pour chaque question, il exécute **20 tirages**, ou le nombre du champ
  `question_draws` : moins pour une question peu variée (inutile de calculer 20 fois les
  mêmes valeurs), plus pour qu’un élève qui s’entraîne longtemps revoie moins
  souvent le même énoncé, au prix d’un fichier plus lourd. Chaque tirage part d’un
  espace de noms neuf, initialisé avec une graine (`random.seed`, et
  `numpy.random.seed` si NumPy est importé), puis exécute `question_setup`.
- **Hachage fixe.** Pyodide est lancé avec `PYTHONHASHSEED=0`, à la compilation
  comme dans le fichier généré. Sinon le hachage des chaînes change à chaque
  chargement de Pyodide, et avec lui l’ordre d’un `set` de chaînes :
  `choice(list(un_ensemble))` donnerait un autre tirage dans le navigateur
  qu’à la compilation.
- **Calcul trop long.** Chaque exécution de `question_setup`, et de `question_check` pour le
  contrôle de cohérence, est limitée à **30 s** (comptées comme au § 5.1).
  Au-delà, la compilation s’arrête : « « question_setup » n’a pas terminé en 30 s pour
  la graine 7 (boucle sans fin ?) ». Le compilateur garde la main et reste
  utilisable. Le premier import des bibliothèques de la question (SymPy :
  quelques secondes, bien plus sur un navigateur lent) n’est pas compté : il
  est fait au chargement des paquets, avant toute exécution limitée.
- **Reproductibilité.** Chaque graine est exécutée deux fois, dans deux espaces
  de noms neufs ; les deux tirages (énoncé et explication rendus, `context`,
  `solutions`, choix) doivent être identiques. Sinon la compilation est refusée :
  « question_setup » utilise un hasard que la graine ne fixe pas (heure,
  `numpy.random.default_rng()`, `secrets`…), et le navigateur ne pourrait pas
  rejouer le tirage. L’erreur apparaît ainsi chez l’auteur, et non chez
  l’élève (« … diffère », § 5.1).
- Un tirage enregistre :
  - `seed` : la graine ;
  - `statement`, `explanation` : l’énoncé et l’explication rendus par Jinja
    (§ 2.10), où chaque champ est remplacé par une marque à son nom, que la
    page remplace par le champ ;
  - `context` : pour le contrôle du tirage rejoué (§ 5.1), la valeur de chaque
    variable de `question_setup` lue par les modèles (selon
    `jinja2.meta.find_undeclared_variables`), écrite par `tex`, et de chaque
    dimension de matrice ; les fonctions, modules et classes en sont exclus,
    leur texte n’étant pas reproductible. Seule une question qui a un
    `question_check` le garde : sans Python, rien ne rejoue le tirage ;
  - `solutions` : la valeur convertie de chaque champ (§ 2.3).
- **Cohérence.** Pour chaque tirage, dans le même espace de noms, le
  compilateur saisit la solution de chaque champ comme le ferait un élève,
  exécute `question_check` (ou, sans `question_check`, la correction par défaut du § 2.6) et
  exige `ok_answer` vrai pour chaque champ (et chaque case d’une matrice).
  Sinon la compilation est refusée avec la graine, le champ et
  le `feedback` obtenu, par exemple « Graine 7 : la solution du champ « r » est
  jugée fausse par « question_check » ». Ainsi le bouton « Correction » ne montre jamais
  une réponse que la correction refuse, et `question_check` ne plante pour aucun tirage.
  Saisie utilisée :
  - `input_text`, case de matrice : le texte de la solution (§ 2.3) ;
  - `input_value` : la solution affichée, lue comme une saisie d’élève (valeur,
    verdict et texte, § 2.8) ;
  - `input_math` : la solution écrite comme pour `input_text` (`x^2 + 1`),
    proche de ce que MathLive transmet ;
  - valeur `ANY` : `1`, une valeur quelconque ;
  - `input_vmatrix` : une grille aux dimensions de la solution ;
  - champ à choix : l’indice ou la liste des indices de la solution.
  Les tests appliquent ce contrôle aux exemples du dépôt, sur 20 tirages ou
  plus (`?draws=200`, § 8).
- Les tirages identiques (même énoncé rendu, même `context` et mêmes `solutions`) sont fusionnés.
  Une question sans aléatoire n’a donc qu’un tirage.
- Les tirages sont intégrés au fichier généré compressés, ou en JSON pour un
  export « pour navigateur ancien » et pour l’aperçu (§ 5.10).
- Les commentaires du code du projet sont retirés de la page générée (§ 5.10) ;
  pas d’autre minification : le Python doit garder son indentation.
- Les scripts et styles du projet sont intégrés dans des balises
  `<script>` et `<style>`. L’assemblage refuse un fichier qui contient
  `</script` (ou `</style` pour une feuille de style) : le navigateur y
  fermerait la balise et la page serait cassée sans message. On refuse au lieu
  d’échapper, car `<\/script` modifierait le texte du module `pywims`, intégré
  tel quel dans son bloc `<script type="text/x-python">`.
- Versions figées : MathJax **3.2.2**, MathLive **0.111.0**. Le widget MathLive
  passe à l’attribut `math-virtual-keyboard-policy`.
- **Module `pywims`.** C’est un vrai fichier Python, `runtime/pywims.py`. Le
  compilateur le lit avec les autres fichiers du projet, une seule fois, à son
  ouverture (§ 11.1), l’installe dans son Pyodide pour calculer les tirages,
  et l’intègre tel quel au fichier généré (bloc
  `<script type="text/x-python" id="pywims-module">`, que le navigateur
  n’exécute pas), seulement si une question a un `question_check`. Tirages calculés et
  tirages rejoués utilisent donc le même module.
- **Script du Worker.** Le code du Web Worker de Python est un vrai fichier,
  `runtime/python-worker.js`. Il suit le chemin du module `pywims` : le
  compilateur le lit en ligne avec les autres fichiers et le donne à `python.js`
  (`setWorkerSource`), les tests aussi, et le fichier généré l’intègre tel
  quel dans un bloc `<script type="text/x-worker" id="pywims-worker">`, que
  le navigateur n’exécute pas, seulement si une question a un `question_check`.
  `python.js` en fait le script du Worker (Blob), ce qui marche aussi en
  `file://`.
- L’auteur peut ajouter ses propres outils à `pywims.py` ; tout nom exporté
  (`__all__`) doit aussi être un nom réservé de `runtime/template.js`, ce que
  vérifient les tests.
- **Aperçu.** La page réelle de la question s’affiche dans un cadre isolé
  (`sandbox="allow-scripts"`), et elle fonctionne comme pour l’élève : saisir,
  « Vérifier », retour de l’auteur, « Correction » (champs remplis et explication),
  « Nouvel énoncé ». L’énoncé étant rendu par Jinja, il n’y a pas d’aperçu sans
  Python : l’aperçu attend le Python de la page du compilateur (quelques
  secondes, une seule fois), puis montre 5 tirages réels calculés par lui,
  gardés en mémoire pour chaque question. Pendant le calcul, l’aperçu
  précédent reste affiché, la ligne d’état disant qu’un tirage se calcule :
  le cadre n’est jamais masqué puis rempli (DECISIONS.md, § 3). L’aperçu montre toujours le premier (le cadre porte
  `data-preview="true"`, que lit `question.js`), pour que ses nombres ne
  changent pas à chaque mise à jour ; « Nouvel énoncé » passe aux autres.
  5 tirages coûtent environ 100 ms, Python chargé.
- **Python de l’aperçu.** Le cadre n’a pas de Python à lui : il emprunte celui
  du compilateur, déjà chargé. À la place de `runtime/python.js`, le cadre reçoit
  un pont qui transmet chaque appel de session au compilateur par `postMessage` ;
  le compilateur l’exécute dans une session à lui, préfixée par le numéro du
  cadre, et renvoie la réponse. Les sessions d’un cadre remplacé sont libérées,
  et les messages d’un ancien cadre ignorés. La vérification est ainsi
  immédiate, sans second Pyodide. La sécurité ne change pas : le code de la
  question tourne déjà dans le Worker du compilateur pour les tirages, et
  seules les opérations de session passent par le pont.

## 4. Structure du fichier généré

- Un seul document, sans iframes. Une question seule est une feuille à une
  question, avec la mise en page « question seule ».
- Chaque question est une `<section>` ; ses identifiants sont préfixés
  (`q2-…`) et elle a sa propre session Python dans le Pyodide commun, qui
  tourne dans un Web Worker.
- Une question sans `question_check` n’intègre pas son champ `question_setup` : il ne sert qu’à
  rejouer un tirage dans Python, et elle ne charge jamais Python. Ses tirages
  suffisent (−25 % pour une activité de QCM dont `question_setup` contient toutes les
  variantes).
- Aucune question n’intègre le modèle de `question_solution_explanation` :
  chaque tirage porte son explication rendue.
- Les styles de la feuille sont dans `css/question.css` et n’utilisent que les
  variables de la charte (§ 11.4).
- Le mode « pages séparées (ZIP) » produit une feuille à une question par
  fichier.

## 5. Comportement à l’exécution

### 5.1 Ouverture

1. Pour chaque question, un tirage est choisi au hasard. Son énoncé, rendu à la
   compilation (`statement`, § 3), s’affiche tout de suite.
2. MathJax compose les formules. Il n’est chargé (≈ 600 Ko) que si la feuille
   peut en afficher : un délimiteur de formule (`$`, `\(`, `\[`) dans un
   énoncé ou une explication rendus, ou un choix d’un tirage, ou
   une question qui a un `question_check`, dont le retour peut contenir une formule.
   MathLive n’est chargé que si une question en a besoin.
3. Seulement pour une question qui a un `question_check` (§ 2.6), et seulement au
   **premier contact** de l’élève avec elle (clic, toucher ou focus dans sa
   carte, ou « Vérifier ma réponse ») : chargement en arrière-plan de Pyodide
   et des paquets détectés, puis exécution de `question_setup` avec la graine du
   tirage. Un élève qui ne fait que lire la feuille, ou ne travaille que les
   questions sans `question_check`, ne télécharge jamais Pyodide. L’apparition
   de la question à l’écran ne lance pas le chargement, ni « Nouvel énoncé »
   avant ce premier contact.
4. Contrôle (questions avec Python) : le `context` recalculé doit être
   identique au `context` stocké. Sinon la question affiche une erreur et ne
   peut pas être vérifiée.
5. Si l’élève clique « Vérifier ma réponse » avant que Python soit prêt, la
   vérification attend la fin du chargement, avec un indicateur dans le bouton.
6. **Calcul trop long.** Python tourne dans un Web Worker : la page garde la
   main pendant ses calculs. L’exécution de `question_check` par « Vérifier » est
   limitée à **15 s**, comptées à partir du début réel du calcul (pas pendant
   une attente derrière le chargement d’une autre question). Au-delà, le Worker
   est arrêté et un Worker neuf le remplace (≈ 1,5 s, fichiers en cache) ; la
   question affiche « La correction a pris trop de temps : votre réponse est
   peut-être trop complexe. Modifiez-la et vérifiez de nouveau. », et ses champs
   restent modifiables. Toutes les sessions sont perdues : chaque question qui
   a un `question_check` se prépare de nouveau (Python, puis `question_setup` avec la graine) à
   sa prochaine vérification, sans message d’erreur pour celles qui se
   préparaient pendant l’arrêt. Le chargement de Pyodide et des paquets n’est
   pas limité : il dépend de la connexion de l’élève.

### 5.2 Cycle de vie d’une question

| État | Boutons visibles |
|---|---|
| Saisie | Vérifier ma réponse (grisé tant qu’aucun champ ouvert n’est rempli) · Correction · Nouvel énoncé |
| Vérifiée, avec erreur | Corriger ma réponse · Correction · Nouvel énoncé |
| Vérifiée, tout juste | Correction · Nouvel énoncé |
| Correction affichée | Nouvel énoncé |

- **Vérifier ma réponse** : les saisies sont transmises à Python (y compris
  celles des champs déjà verts), `question_check` est exécuté, puis chaque champ ouvert
  se colore et le retour s’affiche.
- **Corriger ma réponse** : retour à la saisie sur le même tirage. Les champs
  justes restent verts et figés ; les champs faux sont rouverts avec la saisie
  de l’élève.
- **Correction** : offerte aussi après une réponse juste, pour voir la réponse
  attendue et l’explication, la réussite restant acquise. Tous les champs, y
  compris ceux déjà justes, sont remplis avec
  leur solution et passent au vert (ou « ∗ » neutre pour une valeur libre). Si la
  question a un `question_solution_explanation`, il est rendu avec les valeurs
  du tirage et remplace le retour dans son emplacement, avec la même animation
  et une couleur neutre (bleu marine de la charte) ; sinon l’emplacement est
  vidé. C’est du HTML de l’auteur, comme l’énoncé ; ses formules sont composées
  par MathJax.
- **Nouvel énoncé** : un autre tirage (différent du tirage courant si possible)
  remplace l’énoncé instantanément ; la session Python correspondante est
  recalculée en arrière-plan. Une question qui n’a qu’un tirage (sans
  aléatoire, et `shuffle=false` s’il y a des choix) affiche le même bouton sous le
  nom **Recommencer** : il remet la question vierge. C’est le seul moyen de
  refaire la question après « Correction ».

### 5.3 Progression

- Une question est **réussie** quand une vérification de l’élève est
  entièrement juste. Elle le reste ensuite, même après un nouvel énoncé.
- Une question complétée par « Correction » n’est pas réussie.
- La barre de titre de l’activité affiche le pourcentage de questions réussies
  (même poids pour chaque question) et une barre de progression. Une question
  seule n’affiche pas de progression.
- **Mémoire de la progression (activité seulement).** Le navigateur garde, sur
  l’appareil de l’élève, les questions réussies : un élève qui rouvre
  l’activité, depuis Moodle ou un site, retrouve leur ✓ et son pourcentage.
  Tout le reste repart vierge : énoncés tirés de nouveau, champs vides, notes
  indicatives à 0. Rien n’est envoyé à personne.
  - Stockage : `localStorage`, clé `pywims-progression:` suivie de l’empreinte
    de la feuille ; valeur : les numéros des questions réussies. Toutes les
    feuilles d’un même site partagent ce stockage : l’empreinte les distingue.
  - Empreinte : calculée à la compilation à partir du titre et du contenu de
    toutes les questions (champs et tirages), et inscrite dans la page
    (`data-sheet-id`). Une feuille modifiée puis republiée a une autre
    empreinte : sa mémoire repart de zéro. C’est à l’enseignant de ne pas
    modifier une feuille en cours d’utilisation.
  - Une progression retrouvée à 100 % ne relance pas les confettis.
  - Le stockage peut être indisponible (navigation privée, réglages) : la
    feuille fonctionne alors normalement, sans mémoire.
  - **Réinitialiser.** Dans l’en-tête d’une activité, juste avant le bouton
    d’aide et dans le même style, un bouton ↺ (« Réinitialiser la feuille »
    au survol et pour les lecteurs d’écran) efface la mémoire, après
    confirmation, et recharge la feuille. La confirmation reste nécessaire :
    l’effacement est sans retour, et un toucher par erreur est vite arrivé.
  - Une question seule n’a pas de mémoire.

### 5.4 Mise en page et stabilité

- Boutons : barre d’outils discrète avec icônes, dans la ligne du titre de la
  question ; icônes seules sur téléphone.
- Retour : colonne de droite sur grand écran ; sous l’énoncé sur écran étroit
  (≤ 820 px), avec un agrandissement animé de la carte.
- Rien ne bouge quand on clique sur un bouton : les boutons gardent leur place
  (un bouton absent reste invisible), le libellé principal réserve la largeur
  de « Corriger ma réponse », et les animations n’utilisent que des
  transformations. Exceptions admises : l’agrandissement du retour sur
  téléphone, un champ redimensionné par l’élève, et un nouvel énoncé plus haut
  que les précédents (la carte ne rétrécit jamais). La hauteur gardée est
  celle de l’énoncé tel qu’il s’affiche au départ, choix décochés : une
  question à étapes, déroulée pendant la tentative, ne garde pas la hauteur
  de toutes ses étapes.

### 5.5 Animations

- Champ corrigé ou rempli par la solution : il se replie, change de couleur et
  se redéplie jusqu’à sa taille, sans la dépasser ; les cases d’une matrice se
  suivent.
- Retour : apparition `growIn` existante.
- Question réussie : le numéro devient ✓ avec un effet de rebond.
- Progression : barre et pourcentage animés ; confettis à 100 %.
- Nouvel énoncé : fondu de l’énoncé.
- Tout est remplacé par des changements directs si l’appareil demande des
  mouvements réduits.

### 5.6 Aide de l’élève

- Un bouton « ? » dans l’en-tête ouvre une fenêtre d’aide : le rôle des quatre
  boutons (Vérifier, Corriger, Correction, Nouvel énoncé), avec leurs icônes.
- Dans une activité, l’aide explique aussi le pourcentage : part des questions
  réussies par l’élève lui-même, une question complétée par « Correction » ne compte pas, une
  réussite reste acquise après un nouvel énoncé, même poids pour chaque
  question. Elle précise que les réussites sont gardées sur cet appareil, et
  que le bouton ↺ de l’en-tête réinitialise la feuille (§ 5.3).
- Le même texte, abrégé, apparaît en bulle au survol, au focus ou au toucher du
  pourcentage.

### 5.7 Style compact d’une activité

L’auteur d’une activité peut choisir un style « compact », qui ressemble à une
feuille de TD : case « Style compact » du compilateur, sur la ligne du titre de
l’activité (§ 11.8). La page porte alors `data-style="compact"` sur `<body>`.
Une question seule garde toujours le style habituel. Le style compact ne change
que la présentation : mêmes questions, même cycle de vie, même progression, même
charte (couleurs, polices, logo).

- **Page** : fond blanc, une colonne de texte d’environ 46 em (la largeur d’une
  page A4), sans cartes ; les questions sont séparées par un filet fin.
  L’en-tête garde la charte, en bande plus fine.
- **Numéro** : « 3. » en gras au début de l’énoncé ; le titre de la question
  n’est pas affiché (il reste lu par les lecteurs d’écran). Une question
  réussie a un ✓ vert dans la marge, devant son numéro, qui reste visible.
  Le numéro est sur la première ligne de l’énoncé, même écrit dans un `<p>` :
  la marge du haut du premier élément et celle du bas du dernier sont
  retirées.
- **Boutons** : les trois icônes, sans libellé, en petit et en gris, au bout de
  la première ligne de l’énoncé ; une infobulle donne leur nom. « Vérifier »
  prend la couleur de la charte quand il est actif. La note de la question
  (§ 10.5) est dans la barre d’icônes, juste à gauche de « Nouvel énoncé » ;
  sa largeur est réservée, et son apparition ne déplace aucun bouton. Sur
  écran étroit, les icônes et la note sont sur une ligne au-dessus de
  l’énoncé.
- **Choix** : à la suite dans le texte, sans cadre, chacun à sa largeur ; ils
  passent à la ligne quand la place manque. Le verdict colore le texte et le
  fond léger du choix. Sur écran tactile, chaque choix garde 44 px de haut.
- **Champs** : traits fins (1 px).
- **Retour sur grand écran (> 1000 px)** : une zone commune dans la marge
  droite, qui reste visible au défilement. Elle affiche le dernier retour ou la
  dernière explication, sous « Question 3 », qu’on peut cliquer pour revenir à
  la question. Le verdict des champs reste sur la question. Quand sa question
  sort de l’écran, la zone est grisée, sans être effacée ; un retour effacé
  (« Corriger ma réponse », « Nouvel énoncé ») vide la zone, si c’était le sien.
  Le retour précédent n’est pas gardé : vérifier de nouveau le fait revenir.
  Avant tout retour, la zone dit « Les commentaires et les solutions s’affichent
  ici. ». Le retour est un nœud unique, déplacé de la question dans la zone et
  ramené à sa question au retour suivant ; il n’est jamais copié (formules en
  double, annonces en double aux lecteurs d’écran).
- **Retour sur écran étroit** : sous la question, comme dans le style habituel,
  sans encadré coloré ni animation d’apparition : texte dans la police de la
  charte, avec un filet de la couleur du verdict à gauche.

### 5.8 Espaces avant la ponctuation

Une espace ordinaire avant « : ; ! ? » ou « » », ou après « « », permet au
navigateur de couper la ligne à cet endroit : un « : » se retrouve seul en
début de ligne. Après la composition des formules, la page remplace cette espace
par une espace insécable dans le texte de l’énoncé, des choix et du retour,
jamais dans une formule ni dans un champ. Les fichiers `.pwq` ne changent pas.
Après une formule, Edge et Chrome coupent quand même entre la formule et
l’espace insécable : la formule et la ponctuation qui la suit sont alors
réunies dans un `span` insécable.

### 5.9 Paquet SCORM

L’atelier peut exporter une question seule ou une activité unique en **paquet
SCORM 1.2** (format « Paquet SCORM » d’une question, « Activité unique
(SCORM) » de plusieurs ; jamais pour des pages séparées) : une
archive `…-scorm.zip` qui contient `imsmanifest.xml` et la feuille,
`index.html`, à déposer dans une activité SCORM de Moodle.

- **Ce qui est transmis : la seule progression.** La part des questions
  réussies, de 0 à 100 (0 ou 100 pour une question seule), est la note SCORM
  (`cmi.core.score.raw`, sur 100), que Moodle reporte dans son carnet de
  notes ; l’état est « incomplete », puis « completed » à 100 %. La note des
  barèmes (§ 10.5) n’est pas transmise.
- **La note transmise ne baisse jamais** : « Réinitialiser la feuille » efface
  les réussites, pas une note acquise, ni l’état « completed ».
- **Mémoire.** Dans un LMS, les réussites (numéros des questions) sont gardées
  par le LMS (`cmi.suspend_data`), à la place du navigateur : l’élève les
  retrouve sur un autre appareil. À la fermeture, la tentative est suspendue
  (`cmi.core.exit = suspend`), pour être reprise. Hors LMS (paquet ouvert
  seul), la feuille garde sa mémoire habituelle, dans le navigateur (§ 5.3).
- SCORM 1.2 plutôt que 2004 : c’est la version que Moodle gère le mieux ;
  elle n’a pas de champ de progression, d’où la note sur 100. Le manifeste
  n’a pas de `masteryscore` (le LMS en déduirait « passed » ou « failed »), et
  les schémas XSD ne sont pas joints, Moodle ne les demandant pas.
- Code : `runtime/scorm.js`, intégré seulement au paquet ; la feuille
  (`sheet.js`) s’en sert s’il trouve l’API SCORM du LMS dans une fenêtre
  parente ou dans celle qui l’a ouverte.

### 5.10 Poids de la page

- Les tirages d’une question se répètent presque mot pour mot d’un tirage à
  l’autre : ils sont compressés (gzip, écrit en base64,
  `<pre data-draws="gzip">`), ce qui les divise par quinze environ. La page
  les décompresse à l’ouverture avec `DecompressionStream`, qui demande
  Chrome ou Edge 80, Firefox 113 ou Safari 16.4 (2023) au moins. Sur iPad,
  tous les navigateurs utilisent le moteur de Safari : ce qui compte est la
  version d’iPadOS, et un iPad resté en iPadOS 15 ne peut pas lire la page.
  Un navigateur trop ancien affiche, à la place de chaque question, une
  phrase qui demande la version « pour navigateur ancien ».
- La case « Pour navigateur ancien » de l’atelier, à côté de « Style
  compact » (visible dès qu’une question est cochée), garde les tirages en JSON (`<pre data-draws>`), dont seuls `&` et
  `<` sont échappés. La page est alors environ quatre fois plus lourde pour
  une activité (21 questions de probabilités : 1,5 Mo au lieu de 380 Ko).
- Les commentaires du code du projet (mise en page, styles, scripts, module
  `pywims`) sont retirés de la page : ils pesaient plus d’un tiers d’une
  question seule. En JavaScript et en Python, seules les lignes entières de
  commentaire partent, un `//` en fin de ligne pouvant être dans une chaîne.
  Le contenu des questions n’est jamais modifié.

## 6. Organisation du code

| Fichier | Rôle |
|---|---|
| `runtime/template.js` | grammaire unique des balises et échappement HTML, utilisés par le compilateur (validation, aperçu) et par le fichier généré (rendu) |
| `runtime/correction.js` | correction par défaut sans Python (§ 2.6) : comparaison des choix et des textes, aux différences typographiques près ; utilisée par le fichier généré et par le compilateur |
| `runtime/pywims.py` | module `pywims` : outils de l’auteur, conversion des solutions, contrôles des tirages |
| `runtime/python.js` | Pyodide partagé, dans un Web Worker (la page ne gèle pas, un calcul sans fin peut être arrêté) : création et relance du Worker, appels asynchrones, sessions par question. L’interface reste asynchrone et inchangée pour `question.js` et le compilateur |
| `runtime/python-worker.js` | script du Worker (§ 3) : chargement de Pyodide et des paquets, installation du module `pywims`, graines, exécution du code des sessions |
| `runtime/fields.js` | outils communs sur les champs d’une question : lire et écrire une saisie, figer un champ, choix cochés, animation d’un champ |
| `runtime/question.js` | classe `Question` : rendu d’un tirage, préparation de Python, vérification, correction, solution, nouvel énoncé, note |
| `runtime/sheet.js` | la feuille : création des questions, progression et sa mémoire, note indicative, aide, célébration, redimensionnement |
| `widgets/*.js` | champs de saisie, avec pré-remplissage pour la solution ; le widget de choix retire des colonnes quand un choix déborde |
| `layouts/standard.html` | mise en page commune aux feuilles et aux questions seules |
| `css/question.css` | styles des feuilles, à partir des variables de la charte |
| `css/brand.css` | charte neutre, par défaut (§ 11.4) |
| `css/brands/*.css` | exemples de chartes à copier en `brand.css` dans son dossier de questions (UPEC) |
| `compiler/format.js` | analyse d’un fichier `.pwq`, types de ses champs de réponse ; découpage et réécriture pour l’éditeur, découpage d’un texte collé |
| `compiler/draws.js` | tirages avec Pyodide, contrôles de l’auteur, cohérence, ordre des choix |
| `compiler/assemble.js` | ressources du projet, assemblage des feuilles, empreinte d’une activité |
| `compiler/zip.js` | archive ZIP des pages séparées |
| `compiler/editor.js` | atelier : éditeur d’un seul bloc de la question courante (CodeMirror 5, une coloration par section), validation, enregistrement automatique (§ 11.10) |
| `compiler/compiler.js` | interface du compilateur : dossier de questions, liste, aperçu, compilation, téléchargement ; lit en ligne les fichiers du projet (§ 11.1) |
| `compiler/run-local.ps1` | serveur local et compilateur, pour essayer une modification du moteur avant de la publier |
| `index.html`, `guide/`, `css/site.css`, `favicon.svg` | site du projet : accueil, mode d’emploi et ses modèles (`guide/templates/`), styles et icône communs (§ 11.5, § 11.6) |
| `demos/` | exemple de l’accueil et feuille complète, produits par `tests/tools/demos.py` |

## 7. Questions PyWims existantes

L’export des questions de la base Django PyWims vers des fichiers `.pwq` est
un sous-projet distinct, traité plus tard.

## 8. Tests

- `tests/compiler-tests.html` : analyseur `.pwq`, balises, widgets, correction
  par défaut, assemblage des feuilles ; quelques secondes.
- `tests/runtime-tests.html` : cycle de vie des questions, progression, mémoire,
  délais, avec un Python simulé ; quelques secondes.
- `tests/python-tests.html` : vrai Pyodide (module `pywims`, isolement des
  questions, calcul sans fin, chaque question compilée puis corrigée, seule et
  dans une activité) et balayage des tirages ; « chaque question » : celles de la
  racine de `questions/` et les modèles du mode d’emploi (`guide/templates/`).
- `tests/tools/compiler_e2e.py` : l’interface du compilateur, de bout en
  bout (ouverture d’un dossier de questions, liste, « Tout sélectionner »,
  aperçu réel, compilation, fichier téléchargé, dossier mémorisé, « Relire »,
  « Rouvrir », et le chemin de Firefox et Safari imité sans
  `showDirectoryPicker`), sans erreur JavaScript. Le
  dossier ouvert est une copie des seules questions de la racine de `questions/` :
  comme les autres tests, il ne dépend pas du contenu des sous-dossiers.
- `tests/tools/run-tests.ps1` lance le tout dans Edge sans interface.
- Le pilotage d’Edge passe par Playwright pour Python (`pip install
  playwright`), avec l’Edge installé (`channel="msedge"`) : aucun autre
  navigateur à télécharger. Il ouvre les pages, donne le dossier au sélecteur,
  reçoit les téléchargements et fait les captures.
- `tests/tools/capture.py` : capture d’une page sur ordinateur ou sur
  téléphone (375 px de large, écran tactile), pour vérifier le rendu (§ 9).
- Un test vérifie un comportement, et non la présence d’une chaîne dans le
  code.
- **Un seul analyseur `.pwq`**, celui du compilateur. Le balayage des tirages
  (chaque tirage exécuté, ses solutions converties, saisies comme par un élève
  et jugées justes) passe par lui et par le vrai Pyodide, dans
  `tests/python-tests.html` : 20 tirages par question par défaut,
  `?draws=200` pour un balayage complet, plus lent (quelques minutes). Un
  balayage rapide hors du navigateur demandera Node.js, plus tard.

## 9. Méthode de travail

- Toute modification commence par cette spécification, discutée avant d’écrire
  le code.
- Le travail avance par petites étapes : chacune laisse le projet fonctionnel,
  passe tous les tests, et fait l’objet d’un commit (en français).
- Les commentaires du code, en français, expliquent le pourquoi des choix non
  évidents, y compris les solutions écartées quand elles éclairent le choix
  (par exemple pour l’affichage sur téléphone). Ils décrivent le code tel qu’il
  est, pas l’histoire de ses versions, qui est celle de git.
- La spécification décrit ce qui est. Une solution écartée, un essai, un
  changement de comportement vont dans `DECISIONS.md`, sous le numéro de la
  section concernée.
- Le rendu se vérifie sur ordinateur et sur téléphone (375 px de large,
  `tests/tools/capture.py`).

## 10. Questions à choix

Les questions à choix unique ou multiple suivent le modèle des autres champs :
les choix et la solution sont calculés par `question_setup`, et la saisie est
comparée à la solution, sans Python, sauf `question_check` (§ 10.3). Le compilateur n’analyse pas le LaTeX d’AMC : la conversion d’une
question AMC en fichier `.pwq` est confiée à un LLM, guidé par `PROMPT.md`
(§ 10.8).

### 10.1 Champs

```
{{ input_radio('answer', choices=choices, solution=correct) }}
{{ input_checkbox('answers', choices=choices, solution=correct, columns=2, fixed_last=1, scoring='b=1,m=-0.5') }}
```

| Attribut | Statut | Rôle |
|---|---|---|
| `choices` | obligatoire | variable de `question_setup` : liste des choix, dans l’ordre de l’auteur |
| `solution` | obligatoire | `input_radio` : indice du bon choix ; `input_checkbox` : liste des indices des bons choix, vide si aucun choix n’est bon |
| `columns` | facultatif | grille de n colonnes de même largeur sur grand écran, de 1 à 6 ; sans lui, les choix ont tous la taille du plus grand, sur autant de colonnes que possible (§ 10.7) |
| `shuffle` | facultatif | `shuffle=false` garde l’ordre de l’auteur ; par défaut `true`, les choix sont mélangés |
| `fixed_last` | facultatif | nombre de derniers choix qui restent à la fin, non mélangés (par défaut 0) |
| `scoring` | facultatif | barème à la manière d’AMC (§ 10.5) |

Les indices commencent à 0, dans l’ordre de la liste `choices`.

Un choix est un texte (formules TeX admises ; `tex` y écrit un nombre,
§ 2.10), ou un objet SymPy, affiché comme une formule. L’énoncé de la
question s’écrit dans `question_statement`, avant le champ, comme pour les autres champs.

Aucun choix n’est ajouté automatiquement. Le concepteur qui veut un choix
« Aucune de ces réponses » l’écrit lui-même en dernier, avec `fixed_last=1` ;
c’est un choix comme les autres, qui n’exclut pas les autres cases.

### 10.2 Tirages

- Pour chaque tirage, le compilateur enregistre les textes des choix et leur
  ordre d’affichage. L’ordre est mélangé avec la graine du tirage, sans
  utiliser le `random` de l’auteur ; les `fixed_last` derniers choix restent à
  la fin, dans leur ordre.
- Avec `shuffle=false`, l’ordre d’affichage est celui de la liste `choices`, pour
  tous les tirages : des choix ordonnés (« 1 », « 2 », « 3 », « plus de 3 »),
  ou dont l’ordre porte un sens (« vrai », « faux »), ne sont pas mélangés.
  `fixed_last` n’y a pas de sens, et il est refusé.
- Les textes des choix font partie des valeurs affichées : le navigateur les
  recalcule et les compare comme le `context` (§ 5.1), quand la question a
  un `question_check`.
- Deux tirages qui ne diffèrent que par l’ordre des choix restent distincts :
  « Nouvel énoncé » mélange alors les choix d’une question sans aléatoire.
  Avec `shuffle=false`, une telle question n’a qu’un tirage (§ 5.2, « Recommencer »).

### 10.3 Correction

- `question_check` reçoit sous le nom du champ l’indice choisi (`input_radio`) ou la
  liste croissante des indices cochés (`input_checkbox`, `[]` si rien n’est
  coché), dans l’ordre de l’auteur : le mélange est invisible pour lui.
- `question_check` décide de la réussite par `ok_answer['nom']`, comme pour les autres
  champs. Un choix multiple est juste en tout ou rien.
- `question_check` est facultatif (§ 2.6) : sans lui, la saisie est comparée à la
  solution, sans Python. On ne l’écrit que pour des retours ciblés.
- `question_solution_explanation` joue le rôle de `\explain` d’AMC.

### 10.4 Cycle de vie

- **Saisie.** Un groupe radio compte comme rempli dès qu’un choix est fait ;
  un groupe de cases à cocher compte toujours comme rempli, car ne rien cocher
  est une réponse possible.
- **Vérifier ma réponse.** Seuls les choix cochés se colorent : en vert s’ils
  appartiennent à la solution du tirage, en rouge sinon. Les choix non cochés
  restent neutres, même s’ils sont justes. La couleur est doublée d’une icône
  (✓ ou ✗) pour ne pas reposer sur la seule couleur.
- **Corriger ma réponse.** Si `ok_answer` est vrai, le groupe reste figé. Sinon,
  les choix verts restent cochés et figés ; les choix rouges perdent leur
  couleur et restent cochés ; eux et les choix non cochés redeviennent
  modifiables.
- **Correction.** Les bons choix sont cochés et verts, les autres décochés et
  neutres ; le groupe est figé.
- Rien ne bouge : seules les couleurs, les icônes et l’état des cases changent.
  Les choix colorés s’animent l’un après l’autre, comme les cases d’une matrice.

### 10.5 Barème et note

Il n’y a pas de barème par défaut (pas d’équivalent de `\baremeDefautS` ou
`\baremeDefautM`) : sans attribut `scoring`, aucune note n’est affichée. Le
barème reprend la syntaxe et le sens des directives d’AMC
([documentation](https://www.auto-multiple-choice.net/fr/doc/scoring/)). Une
directive absente d’un barème donné prend la valeur indiquée :

| Directive | Si absente | Rôle |
|---|---|---|
| `b` | 1 | bonne réponse (`input_radio`) ; case bien traitée, c’est-à-dire bonne cochée ou mauvaise non cochée (`input_checkbox`) |
| `m` | 0 | mauvaise réponse ; case mal traitée |
| `d` | 0 | décalage ajouté au score |
| `p` | — | plancher |
| `P` | — | plafond |
| `mz` | — | « maximum ou zéro » : `mz` si toutes les cases sont bien traitées, 0 sinon |
| `haut` | — | `haut=n` se réécrit en `d=n−N,p=0`, N étant le nombre de choix de l’auteur |
| `MAX` | — | note maximale affichée, si elle diffère du score d’une réponse parfaite |
| `v` | 0 | aucune case cochée (`input_checkbox`), alors que la solution n’est pas vide |
| `e` | — | accepté sans effet : une saisie incohérente est impossible ici |

- Score : `v` si rien n’est coché alors que la solution n’est pas vide ;
  sinon `mz` s’il est donné ; sinon `b` ou `m` (choix unique) ou la somme des
  cases (choix multiple), plus `d`. Le plancher puis le plafond s’appliquent
  ensuite. Si la solution est vide, ne rien cocher est la réponse parfaite.
- Le maximum est `MAX`, ou le score d’une réponse parfaite.
- Les autres directives d’AMC (`formula`, `set.…`, `default.…`, `requires.…`,
  `auto`, barème propre à une réponse, `SUF`, `allowempty`) sont refusées à la
  compilation.
- Un barème n’est admis que si le champ à choix est le seul champ de la
  question.
- Chaque vérification affiche une nouvelle note dans le coin inférieur droit
  de la question, par exemple « Note : 2,5 / 7 ». C’est une indication pour
  l’entraînement, pas une évaluation. Sa place est réservée dès l’affichage
  (son apparition ne déplace rien), mais au plus juste : elle empiète sur la
  marge qui suit le groupe de choix, sans toucher au dernier choix.
- La note est réservée à une activité dont **toutes** les questions ont un
  barème, un « examen blanc » de QCM. Si une question au moins n’en a pas,
  aucune question n’affiche de note, l’activité n’a pas de note indicative
  (seulement sa progression), et l’aide n’en parle pas. Une question seule
  n’a jamais de note. Dans tous les cas, le barème reste vérifié à la
  compilation. Dans l’atelier, en mode « Activité unique », si une partie
  seulement des questions choisies a un barème, un avertissement bref
  (« Certaines questions n’ayant pas de barème, l’activité n’affichera pas de
  note, uniquement la progression. ») s’affiche en haut du cadre de l’aperçu,
  sous l’ordre des questions, dès le choix ; il nomme les questions sans barème
  au survol, pour ne pas prendre la hauteur de l’aperçu. L’export reste
  possible.

### 10.6 Contrôles à la compilation

En plus du § 2.4, le compilateur refuse la question si, pour l’un des tirages :
- `choices` n’est pas une liste d’au moins deux choix ;
- `solution` n’est pas un indice valide (`input_radio`) ou une liste
  d’indices valides et distincts (`input_checkbox`) ;
- deux choix ont le même texte, aux différences typographiques près (§ 2.6) :
  l’élève ne pourrait pas les distinguer, et un seul serait juste. C’est
  l’erreur ordinaire d’une liste de choix calculés (deux formules d’erreur qui
  donnent la même valeur pour un tirage) ; la graine en cause est indiquée ;
- `fixed_last` est supérieur ou égal au nombre de choix, ou donné avec
  `shuffle=false`, `columns` sort de 1 à 6, ou `shuffle` n’est pas un
  booléen (§ 2 ; `shuffle=0` est refusé avec la nouvelle écriture) ;
- le barème contient une directive inconnue ou refusée, ou une valeur non
  numérique, ou la question contient d’autres champs.

### 10.7 Activité et affichage

- La réussite d’une question reste en tout ou rien et seule compte dans le
  pourcentage (§ 5.3).
- Si toutes les questions ont un barème (§ 10.5), la barre de titre de
  l’activité affiche aussi une **note indicative**, à côté du pourcentage :
  la somme des notes des questions sur la somme de leurs maxima. La
  note d’une question est celle de sa dernière vérification ; elle vaut 0
  avant toute vérification et revient à 0 après « Nouvel énoncé », mais pas
  après « Correction ». L’aide (§ 5.6) l’explique.
- Chaque choix est une ligne entière cliquable d’au moins 44 px de haut, dans
  un `fieldset`. Seule sa case (bouton radio ou case à cocher) est encadrée :
  comme pour les autres champs, ce qui est entouré, c’est la zone de saisie. Le
  verdict colore le texte et le fond léger du choix, avec son icône.
- **Sans `columns`**, les choix restent alignés en grille : tous ont la
  largeur et la hauteur du plus grand, et le nombre de colonnes est le plus
  grand qui tienne dans la largeur de l’énoncé, sans autre limite que le
  nombre de choix ; c’est un `columns` calculé. Il est recalculé quand la
  largeur de la fenêtre change (rotation du téléphone). Si le plus grand choix
  est plus large que l’énoncé, il n’y a qu’une colonne, de la largeur de
  l’énoncé, où le texte passe à la ligne. Le script ne calcule que le nombre
  de colonnes, en mesurant les choix une fois les formules composées ; la
  grille, ajustée à son contenu, donne elle-même à ses colonnes égales la
  largeur du plus grand choix.
- **Place de l’icône du verdict.** Elle est réservée par une largeur
  (`width: 1.2em`), et non par une base flexible (`flex-basis`) : Firefox ne
  compte pas une base flexible dans la largeur naturelle d’une case tant que
  la place est vide, et le texte du choix perdait cette largeur.
- **Avec `columns=n`**, les choix forment une grille de n colonnes
  de même largeur ; sur écran étroit, le nombre de colonnes diminue pour que
  chaque choix garde une largeur minimale (environ 8 em), puis tant qu’un
  choix ne tient pas dans sa colonne : un mot ou une formule n’est jamais
  coupé ni masqué, ce qui changerait le sens du choix. Des choix courts
  restent ainsi côte à côte sur téléphone.
- **Défilement.** Le texte d’un choix ne défile pas. Seul un choix qui
  déborde encore de plus de 1 px quand il ne reste qu’une colonne défile en
  largeur, en dernier recours ; la même mesure décide des colonnes et du
  défilement. Cette mesure porte sur ce que l’élève voit : la copie MathML
  invisible que MathJax ajoute à chaque formule pour les lecteurs d’écran est
  réduite à 1 px de large, sinon Edge et Chrome la comptaient (une copie plus
  large que la formule dessinée, de 6 px pour « [−16 ; 4] » en style compact,
  faisait défiler le choix). Le test `tests/tools/scrollbars.py`
  vérifie, sur des activités exportées dans les deux styles, à plusieurs
  zooms et largeurs, qu’aucune barre n’apparaît sans débordement réel.

### 10.8 Conversion depuis AMC

`PROMPT.md` reçoit une section « Convertir une question AMC » :
- `question` → `input_radio`, `questionmult` → `input_checkbox` ;
- `\bonne` et `\mauvaise` → la liste `choices` et les indices de `solution` ;
- la case « Aucune de ces réponses » ajoutée par l’option `completemulti`
  d’AMC → un dernier choix écrit explicitement, avec `fixed_last`, qui fait
  partie de la solution quand aucun autre choix n’est bon ;
- `\lastchoices` → `fixed_last`, `reponseshoriz` → `columns`, `\explain` →
  `question_solution_explanation`, `\bareme{…}` → `scoring='…'` ; un barème par défaut
  (`\baremeDefautS`, `\baremeDefautM`) est recopié dans chaque question
  concernée ;
- calculs (`\FPeval`, macros) → Python dans `question_setup` ;
- transposition du texte (`\textbf` → `<b>`, `\og…\fg` → « … », formules
  conservées) ;
- une question AMC par fichier `.pwq` ;
- tout ce qui ne se transpose pas (image, question ouverte, barème refusé…)
  est signalé, pas approximé ;
- un exemple complet, du source AMC au fichier `.pwq`.

### 10.9 Choix tirés au hasard : `mcq`

Un QCM dont les choix eux-mêmes changent d’un tirage à l’autre, et pas
seulement leur ordre : la bonne réponse se calcule avec les valeurs de
l’énoncé, et les mauvaises sont tirées d’une réserve (erreurs types,
distracteurs). L’outil `mcq` de `pywims` fait ce tirage, avec le `random` de
l’auteur, donc avec la graine du tirage.

```python
from random import randint
from pywims import mcq

a, b = randint(2, 9), randint(2, 9)
choices, correct = mcq(correct=a * b, wrong=[a + b, a * b + 1, a * (b - 1), a * b - a, (a + 1) * b], count=4)
```

- **Choix unique** : `mcq(correct=valeur, wrong=[…], count=4)` renvoie
  `(choices, index)` : `count` choix, la bonne réponse et `count − 1` mauvaises
  tirées au hasard dans `wrong`, dans un ordre mélangé, et l’indice de la bonne.
- **Choix multiple** : `mcq(correct=[…], wrong=[…], count=5, correct_count=2)`
  renvoie `(choices, indices)` : `correct_count` bonnes réponses tirées dans
  `correct` (toutes par défaut) et des mauvaises pour compléter, et la liste
  croissante des indices des bonnes. `correct_count` peut valoir 0.
- **Doublons.** Deux valeurs qui s’afficheraient de la même façon (même texte,
  aux espaces près ; même formule pour un objet SymPy) n’en font qu’une, et
  une mauvaise réponse égale à une bonne est retirée : `a + b` vaut parfois
  `a × b`. C’est le défaut ordinaire des distracteurs calculés, que le
  compilateur refuserait sinon (§ 10.6).
- **Réserve insuffisante.** Si, une fois les doublons retirés, il reste trop
  peu de mauvaises réponses (ou de bonnes), `mcq` lève une erreur qui le dit ;
  le compilateur la signale avec la graine. La réserve doit donc être plus
  large que le besoin, ou sans doublon possible.
- Le résultat s’utilise comme une liste écrite à la main :
  `{{ input_radio('answer', choices=choices, solution=correct) }}`. L’ordre étant
  déjà tiré au hasard, le mélange du compilateur ne change rien ; avec
  `shuffle=false`, l’ordre de `mcq` est gardé.

## 11. Site du projet : compilateur hébergé, accueil, mode d’emploi

Le projet est publié en ligne : une page d’accueil qui le présente et le montre,
le compilateur, où l’on ne choisit plus que son dossier de questions, et un mode
d’emploi pour créer une question, avec ou sans IA.

### 11.1 Publication

- Le site est publié par GitHub Pages depuis la branche `master` du dépôt
  public, à l’adresse `https://esandier.github.io/PyWimsOnHTML/` : accueil
  (`index.html` à la racine), compilateur (`compiler/`), mode d’emploi
  (`guide/`). C’est gratuit pour un dépôt public ; l’activation se fait une
  fois dans les réglages du dépôt.
- Chaque push sur `master` met à jour le site.
- Les fichiers du projet utiles à l’assemblage (`layouts/`, `runtime/`,
  `widgets/`, `css/`) sont lus par le compilateur à côté de lui (même origine),
  une seule fois, à son ouverture, sans cache périmé (revalidation auprès du
  serveur) : l’aperçu, les tirages et la compilation utilisent la version des
  scripts de la page, jamais deux versions mêlées du projet. Une modification du
  moteur demande de recharger la page.
- Le module `pywims` et le script du Worker sont lus en ligne avec les autres
  fichiers, puis intégrés au fichier généré : tirages calculés et rejoués
  utilisent le même code (§ 3).
- Python (Pyodide, SymPy et le module `pywims`) se charge dès l’ouverture du
  compilateur, en arrière-plan : le premier aperçu et la première compilation
  n’attendent pas son chargement (de 10 s à beaucoup plus, selon le navigateur
  et la connexion). Un échec de ce préchargement est silencieux : la
  compilation recommence le chargement, et en donne l’erreur.
- **Développement local** : `compiler/run-local.ps1` démarre un serveur
  local à la racine du projet et ouvre le compilateur dans le navigateur ; on
  essaie ainsi une modification du moteur avant de la publier. Le serveur
  (`compiler/local-server.py`) interdit le cache (`Cache-Control: no-store`),
  pour qu’une modification apparaisse au rechargement. Ouvert
  directement depuis le disque (`file://`), le compilateur ne peut pas lire
  ses fichiers : il le dit, et indique ce script.
- Les questions ne sont jamais envoyées : la page les lit sur l’ordinateur.
- L’extension reste `.pwq` : le format est celui de PyWims, que ce projet
  ressuscite.

### 11.2 Dossier des questions

- Un seul dossier de questions à la fois, n’importe où sur le disque. Les
  fichiers `.pwq`, et les archives `.pwqa` et `.zip` (§ 2.7), de ses
  sous-dossiers sont lus aussi.
- **Chrome et Edge** : le dossier est choisi une fois et mémorisé (accès
  conservé par le navigateur, dans IndexedDB). À la visite suivante, un bouton
  « Rouvrir « nom du dossier » » suffit : le navigateur demande seulement de
  confirmer l’accès. Un bouton « Relire » prend en compte les fichiers modifiés,
  ajoutés ou supprimés, sans choisir de nouveau le dossier ; la compilation
  relit elle aussi les fichiers de questions.
- **Firefox et Safari** : ces navigateurs ne permettent pas à une page de
  rouvrir un dossier d’une visite à l’autre. Le dossier se choisit à chaque
  visite ; le nom du dernier dossier est rappelé pour aider à le retrouver.
  Pour prendre en compte un fichier modifié, on choisit de nouveau le dossier
  (le message du § 11.3 le rappelle).
- La page détecte ce que le navigateur permet ; aucun message d’erreur ne
  signale l’absence de mémorisation.

### 11.3 Liste des questions

- Une ligne par question : son **titre**, puis, à droite, en petit et en gris,
  les types de champs de réponse qu’elle utilise, dans l’ordre de l’énoncé et
  sans répétition : « texte », « nombre », « formule », « matrice », « matrice
  redimensionnable », « choix unique », « choix multiple ». Un titre trop long
  est coupé par « … » ; le survol donne le titre, les types et le chemin.
- Les questions sont regroupées par sous-dossier (le dossier choisi d’abord,
  puis chaque sous-dossier sous son chemin, en intertitre), et triés par titre
  dans l’ordre naturel (« (2) » avant « (10) ») dans chaque groupe. Sans
  sous-dossier, la liste n’a pas d’intertitre.
- Un fichier illisible est listé sous son nom de fichier, avec la mention
  « fichier illisible » ; son erreur s’affiche quand on le choisit.
- La recherche porte sur le titre, les mots-clés et le chemin.
- Un bouton « Tout sélectionner » coche les questions visibles, c’est-à-dire
  ceux que la recherche laisse affichés ; quand ils sont tous cochés, il devient
  « Tout désélectionner » et les décoche. Les questions masquées par la
  recherche gardent leur état.
- Un fichier modifié ou supprimé après l’ouverture du dossier, quand le
  navigateur ne peut pas le relire (Firefox, Safari) : la compilation
  l’explique (« … a changé depuis l’ouverture du dossier : rouvrez le
  dossier ») au lieu d’afficher le message brut du navigateur.

### 11.4 Charte

- La charte d’une feuille (couleurs, polices, logo) est une feuille de style
  qui ne définit que les variables et le logo prévus par `css/brand.css`.
- **Par défaut, une charte neutre** : `css/brand.css`, sans logo ni couleurs
  d’établissement. La charte de l’UPEC devient un exemple,
  `css/brands/upec.css`.
- **Charte du dossier** : si le dossier de questions contient un fichier
  `brand.css` à sa racine, il remplace la charte par défaut, pour l’aperçu
  comme pour les fichiers générés. Un enseignant y met la charte de son
  établissement, une fois pour toutes.
- Le compilateur indique la charte utilisée (« Charte : brand.css du dossier »
  ou « Charte neutre »).

### 11.5 Mode d’emploi : créer une question

Une page `guide/` (« Créer »), en sections :

- **Avec une IA** : trois boutons. « Copier le prompt » copie le texte de
  `PROMPT.md` ; « Voir le prompt » le déplie dans un cadre sous les boutons,
  qu’on referme du même bouton ; « Télécharger le prompt » l’enregistre. On le
  colle dans son assistant, on décrit la question voulue (ou on donne une
  question AMC à convertir), puis on colle la réponse dans le compilateur
  (« Coller question(s) », § 11.10).
- **Sans IA** : deux modèles commentés, chacun avec « Télécharger » et
  « Voir » (le fichier déplié dans un cadre, comme le prompt) : un QCM sans
  Python (`guide/templates/qcm.pwq`) et une question à données aléatoires et
  réponse calculée (`guide/templates/calcul.pwq`).
- **Structure d’un fichier** : tableau des champs, puis `question_setup`, `question_statement` et
  `question_check` ; pas d’exemple recopié, les modèles se déplient juste au-dessus.
- **Les champs de réponse** : syntaxe commune, puis un élément dépliable par
  type de champ, le barème et `ANY`.
- **Compiler et publier**, **Bon à savoir** (entraînement seulement, poids de
  Python, renvoi à `PROMPT.md`, référence complète du format).
- Les modèles sont des questions vérifiées par les tests, comme celles de la
  racine de `questions/`.

### 11.6 Page d’accueil, bandeau commun

- **Bandeau commun** aux trois pages (accueil, Créer, atelier) :
  « PWOH », « questions à données aléatoires dans une page HTML », et les
  boutons Accueil, Créer, Atelier, Prompt, Code source, à droite. « Prompt »
  copie `PROMPT.md` (`banner.js`) et le dit sur le bouton lui-même (« Prompt
  copié ✓ »). La page du compilateur s’appelle « Atelier » pour l’utilisateur ;
  son dossier reste `compiler/`, pour ne pas casser les
  adresses déjà diffusées. Sur l’atelier, le bandeau remplace le titre (la page tient dans la fenêtre), et les
  messages se placent entre la devise et les boutons.
- **Style** : celui du compilateur (accent orange, panneaux blancs sur fond
  gris), pour tout le site.
- `index.html` : ce que fait PWOH en un paragraphe ; un **exemple d’activité à
  deux questions**, intégré à la page dans un cadre ; les caractéristiques pour
  l’élève et pour l’enseignant ; « Pour commencer » en cinq étapes ; mention
  de la licence en bas. Un lien discret mène à une feuille plus complète.
- **Démonstrations** (`demos/`) : `example.html` (l’activité de l’accueil) et
  `sheet.html` (toutes les questions de la racine de `questions/`), compilées
  avec la charte neutre. Un script (`tests/tools/demos.py`) les recompile par
  le vrai compilateur ; on le lance avant de publier une modification du
  moteur.
- Lisible sur téléphone : aucune page ne défile en largeur. Une formule de
  l’énoncé ou du retour plus large que sa zone (de plus de 1 px) défile
  seule, sur sa propre ligne ; une formule qui tient ne défile jamais.

### 11.7 Étapes

Réalisées ; leur déroulement est dans `DECISIONS.md`.

### 11.8 Disposition du compilateur

- **Bandeau** sur le fond de la page, séparé du reste par un filet sur toute
  la largeur de la fenêtre (sur les trois pages).
- **Deux colonnes, deux rangées.** En haut, à gauche la ligne du dossier
  (« Dossier ouvert : nom », « Relire », « Autre dossier »), à droite la ligne
  de compilation ; toutes deux sans cadre, alignées, de même hauteur et
  discrètes (petits boutons) : le compilateur est un environnement de travail,
  dont l’éditeur et l’aperçu sont l’essentiel. Dessous, les cadres commencent à
  la même hauteur :
  - à gauche, en tête, « ← » (dans l’éditeur seulement) ou, dans la liste, le
    compte de la sélection et « Tout sélectionner », puis, à droite,
    « Coller question(s) » (§ 11.10) ; la **Liste** :
    le champ « Filtrer par nom ou mot-clé » (libellé dans le champ), liste, et
    la charte utilisée en petit, en bas ;
    l’**Éditeur** : la question courante ;
  - à droite, sans titre, la liste d’ordre (§ 11.9) dans son cadre quand elle
    sert, puis l’**Aperçu** (ligne d’état et page de la question) sur la hauteur
    restante.
- **Ligne de compilation** : le bouton « Exporter la sélection », puis la
  liste du format, qui dépend du nombre de questions cochées : « Page HTML »
  ou « Paquet SCORM » pour une question ; « Pages séparées (ZIP) »,
  « Activité unique (HTML) » ou « Activité unique (SCORM) » pour plusieurs
  (§ 5.9). Puis « Titre » et son champ, et la case « Style compact » (§ 5.7),
  présents seulement pour une activité unique. La case est décochée à
  l’ouverture d’un dossier, comme le titre est vidé.
- Sur téléphone, tout s’empile : dossier, Liste, ligne de compilation,
  liste d’ordre, Aperçu.

### 11.9 Ordre des questions d’une activité

Une activité suit l’ordre dans lequel les questions ont été cochées, que
l’auteur voit et change.

- **Liste d’ordre.** En mode « Activité unique », un cadre montre « Ordre des
  questions » et la liste numérotée des questions cochées, une par ligne. La
  liste défile seule au-delà d’une hauteur fixe (environ six lignes, quatre
  sur téléphone), pour laisser la place à l’aperçu.
- **Question choisie, flèches fixes.** Un clic sur une ligne choisit la
  question : sa ligne passe en surbrillance et son aperçu s’affiche (la
  question affichée par la liste des questions, si elle est cochée, est
  choisie de même). Deux boutons fixes, « ↑ » et « ↓ », à côté de « Ordre des
  questions », déplacent la question choisie d’un rang ; ils sont inactifs sans
  question choisie, « ↑ » en tête et « ↓ » en fin. Des clics répétés au même
  endroit déplacent donc toujours la même question, à la souris comme au
  clavier ; la liste défile pour la garder visible.
- **Rang dans la liste des questions.** En mode « Activité unique », chaque
  question cochée porte son rang (1, 2, …) à côté de sa case.
- **Ordre gardé.** Cocher ajoute la question à la fin, décocher la retire ;
  « Tout sélectionner » ajoute les questions visibles non cochées à la fin,
  dans l’ordre de la liste. « Relire » garde l’ordre (une question disparue
  est retirée). L’ordre n’est pas retenu d’une visite à l’autre.
- Pages séparées (ZIP) : l’ordre est sans effet, la liste d’ordre est masquée.

### 11.10 Atelier : parcourir, retoucher et coller des questions dans le compilateur

La page sert trois parcours :

1. **Composer une activité** : parcourir les questions d’un dossier avec leur
   aperçu, cocher, ordonner, compiler (§ 11.9).
2. **Vérifier et retoucher** : parcourir la liste, essayer chaque question dans
   l’aperçu, corriger de petites choses.
3. **Coller une question écrite par une IA**, la vérifier et la retoucher.

Tous tournent autour d’**une seule question courante** : celle qu’on choisit dans
la liste, que montre l’aperçu, et que montre l’éditeur.

**Edge et Chrome seulement.** Firefox et Safari interdisent à une page d’écrire
dans un dossier. Sous Firefox et Safari, le compilateur garde
l’aperçu, la composition des feuilles et la compilation ; l’atelier y est
remplacé par la phrase « Pour modifier les questions, ouvrez l’atelier dans
Edge ou Chrome. »

**Dossier ouvert en écriture.** Sous Edge et Chrome, le dossier est ouvert en
lecture et écriture : le navigateur demande l’autorisation une fois, à
l’ouverture (ou à la réouverture du dossier mémorisé).

**Liste ou éditeur.** Chaque ligne de la liste donne la case à cocher, le titre
avec les types de champs dessous, puis deux boutons : **Éditeur** et
**Supprimer**. Cliquer sur une question en fait la question courante et montre
son aperçu ; au clavier, dans la liste, ↑ ↓ passent à la question précédente ou
suivante, avec son aperçu, Entrée l’ouvre dans l’éditeur et Espace la coche. On
regarde d’abord, et on décide de modifier en voyant la question : « Éditeur »
la montre. Dans l’éditeur, « ← » (infobulle « Retour à la liste ») ramène à la
liste. **Supprimer** efface le fichier du dossier après confirmation : une
question écrite par une IA n’est souvent suivie par aucun git. Changer de question ne perd rien :
l’enregistrement est automatique. En mode Éditeur, le panneau de gauche s’élargit
aux trois cinquièmes de la largeur ; l’aperçu reste à droite. La case à cocher
garde son rôle (composer une feuille). Un fichier mal formé s’ouvre aussi dans
l’éditeur : c’est là qu’on le corrige. Une archive `.pwqa`, qui contient aussi
ses images, ne s’édite pas : l’éditeur le dit.

**Un seul bloc.** La question s’édite en entier, comme dans un éditeur de code :
une question se lit d’un bloc, les variables de `question_setup` servent dans
l’énoncé. CodeMirror 5 (cdnjs, version fixée, chargé à la première ouverture)
colore chaque section selon son contenu : les lignes `%` et `% question_…` en
intertitres, Python pour `question_setup` et `question_check`, HTML pour
l’énoncé et l’explication, avec en couleur les champs `{{ input_…(…) }}`,
le reste de Jinja (`{{ … }}`, `{% … %}`) et les formules. Chaque section se replie par son intertitre.
Numéros de ligne, Tab (quatre espaces), retour à la ligne indenté, Ctrl+Z (chaque
question garde son historique pendant la visite).

**Aperçu à la demande.** « Actualiser l’aperçu », au-dessus de l’aperçu, ou
Ctrl+Entrée dans l’éditeur, montre la version de l’éditeur, avec ses tirages
réels calculés par Python, et il fonctionne comme pour l’élève (§ 3, Aperçu) :
on retouche puis on vérifie une réponse, juste ou fausse, et le retour qu’elle
donne. Il montre toujours le premier tirage ; « Nouvel énoncé », dans la
question, passe aux autres. Une mise à jour remet la question à zéro, et
l’aperçu précédent reste affiché pendant le calcul. Après une pause de la
frappe, la ligne d’état de l’aperçu dit seulement que le texte a changé ; la
validation du format et l’enregistrement, eux, restent automatiques.

**Erreurs.** Sous l’éditeur, une ligne d’état donne l’erreur de format ou de
balise (à la frappe) et l’erreur Python du tirage de l’aperçu, avec un lien
« ligne n » qui place le curseur sur la ligne fautive du fichier.

**Enregistrement automatique.** Après chaque pause de la frappe, le fichier est
écrit dans le dossier, même s’il contient une erreur : la compilation la
signale, et la ligne d’état la montre. Un témoin discret dit « Enregistrement… »
puis « Enregistré ». Si le fichier a changé sur le disque depuis sa dernière
lecture (modifié dans un autre éditeur), le compilateur demande avant de
l’écraser. Changer de question, ou de dossier, enregistre d’abord ce qui ne l’est
pas encore ; quitter la page pendant une pause de la frappe demande
confirmation. Les fins de ligne du fichier (CRLF ou LF) sont gardées. « Relire »
met à jour la question de l’éditeur si son fichier a changé sur le disque.

**Prompt et collage.** « Prompt », dans le bandeau (§ 11.6), copie `PROMPT.md`.
En tête du panneau de gauche, à droite, précédé de son message bref :

- **Coller question(s)** (infobulle : « Coller le code d’une ou plusieurs
  questions ») : passe à l’éditeur, vide, avec « Collez ici le code d’une ou
  plusieurs questions (Ctrl+V) », le curseur dedans. Sans dossier ouvert, le
  bouton demande d’en ouvrir un.

Le texte collé est découpé en questions aux lignes `=== nom.pwq ===` que
`PROMPT.md` demande pour plusieurs questions ; à défaut, avant chaque
`% question_title`. Les lignes de bloc de code (```) et le texte qui précède le
premier `%` sont retirés : les IA en ajoutent malgré la consigne. Chaque question
est aussitôt écrite à la racine du dossier, sous le nom de la ligne `===` ou un
nom tiré du titre (`loi-binomiale.pwq`), rendu unique s’il est déjà pris, et
marquée « nouvelle » dans la liste pendant la visite. Une seule question : elle
devient la question courante, et l’éditeur la montre. Plusieurs : la page
revient à la liste, où on les voit toutes, et la première devient la question
courante ; sinon, on pourrait croire perdues les suivantes.

## 12. Points ouverts

- **Banque de questions** (comme `\element` et `\restituegroupe` d’AMC) : une
  question de l’activité serait un groupe de fichiers `.pwq`, chaque tirage
  appartenant à l’un d’eux. Chantier ultérieur.
- **Graphiques matplotlib** dans les énoncés, produits en SVG à la
  compilation. Chantier ultérieur.
- **Glisser-déposer** (balises PyWims `input_drag` / `input_drop`). Chantier
  ultérieur.
- **Figures interactives** avec GeoGebra et/ou JSXGraph. Chantier ultérieur.
- **Outils SymPy pour `question_check`** (comparer une expression saisie en une ligne).
- **Tests hors du navigateur** (Node.js) et intégration continue sur GitHub,
  avant la diffusion large.
- **Clavier choisi par l’auteur** pour une case ou un champ (pavé numérique
  quand toutes les réponses sont des nombres positifs).
- **KaTeX à la place de MathJax** : plus léger et plus rapide ; à étudier
  (couverture de l’écriture des questions, par exemple `@{\;}` dans un
  `array`, rendu, MathLive). Mesure d’octobre 2026 : MathJax pèse 603 Ko, et
  compose les 21 questions d’une activité en 2,5 s sur un processeur ralenti
  4 fois.
