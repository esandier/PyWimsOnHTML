# Spécification — feuilles d’exercices et tirages précalculés

Ce document rassemble les décisions prises avant le développement. Il sert de
référence : une implémentation qui s’en écarte doit d’abord le modifier.
La maquette [`maquettes/feuille-activite.html`](maquettes/feuille-activite.html)
illustre l’apparence et le comportement attendus.

## 1. Objectifs

1. L’énoncé s’affiche dès l’ouverture du fichier, sans attendre Python.
2. Pyodide se charge en arrière-plan ; la correction par Python reste complète.
3. Une activité est une feuille d’exercices compacte dans une seule page :
   un seul chargement de Pyodide, MathJax et MathLive pour toutes les questions.
4. L’apparence suit `css/brand.css`, y compris pour les activités.
5. L’élève est surtout sur téléphone. Le fichier HTML reste unique et de taille
   raisonnable. Il faut une connexion pour la correction (bibliothèques en ligne).
6. Hors périmètre : le secret des réponses et la notation, qui exigeraient un
   serveur. Le pourcentage affiché mesure la progression de l’entraînement.

## 2. Format `.pwq`

L’extension signifie « PyWims question » : un fichier décrit une question,
et une activité en réunit plusieurs.

### 2.1 Champs

| Champ | Statut | Rôle |
|---|---|---|
| `title`, `keywords`, `layout` | obligatoire | inchangés |
| `avant` | obligatoire | tirage et calcul des solutions |
| `enonce` | obligatoire | modèle de l’énoncé |
| `apres` | obligatoire | correction |

Le retour n’est plus un champ : c’est la variable `feedback` de `apres`
(§ 2.2). Les anciens champs `reponse` et `feedback` sont refusés avec un
message qui l’explique.

Le champ `libraries` disparaît : le compilateur déduit les paquets Pyodide des
`import` du code. Le champ `ggb_commands` est retiré pour le moment ; GeoGebra
reviendra plus tard, peut-être sous une autre forme.

### 2.2 Python

- Chaque exercice importe explicitement ce qu’il utilise :
  `import sympy as sp`, `from sympy import …`, `import random`, etc.
- Les outils PyWims viennent d’un module dédié :
  `from pywims import py_wims, is_nombre, math_expression`.
  Ses fonctions internes ne sont pas visibles par l’auteur, qui ne peut donc
  pas les perturber (par exemple en écrivant `E = 3`).
- `apres` partage l’espace de noms de `avant` et y trouve les saisies de
  l’élève sous le nom de chaque champ.
- Contrat de sortie de `apres` : `ok_answer[nom_du_champ] = True/False` pour
  chaque champ (`"matrice[i][j]"` pour une case), et, facultativement, une
  variable `feedback` : un texte (formules TeX admises) qui explique l’erreur
  sans donner la réponse. Sans elle, le retour est « Bravo, c’est exact ! » ou
  « Certaines réponses sont incorrectes. ». Le texte est échappé ; ses formules
  sont composées par MathJax.
- Variable facultative de `avant` : `explication_solution`, un texte (formules
  TeX admises) affiché avec la solution (§ 5.2).
- Pour lire une saisie qui contient une expression (champ texte ou case de
  matrice), utiliser `math_expression` plutôt que `py_wims` : sa grammaire est
  restreinte et accepte l’écriture des élèves (`2x`, `x^2`).

### 2.3 Balises de saisie

Chaque balise porte obligatoirement `solution=variable`, le nom d’une variable
définie par `avant` :

```
{% input_text 'resultat' solution=somme style='width:7em' %}
{% input_math 'derivee_eleve' solution=derivee %}
{% input_matrix 'matrice' rows=m cols=p solution=produit input_style='width:2em' %}
{% input_vmatrix 'matrice' max_rows=5 max_cols=5 solution=produit %}
{% input_radio 'reponse' choices=choix solution=bonne %}
{% input_checkbox 'reponses' choices=choix solution=bonnes columns=2 %}
```

Les questions à choix (`input_radio`, `input_checkbox`) sont décrites au § 10.

La valeur de la solution est convertie selon le type de champ :

| Champ | Conversion |
|---|---|
| `input_text` | texte tel qu’un élève l’écrirait : `Rational(19, 12)` → `19/12`, `x**2 + 1` → `x^2 + 1` |
| `input_math` | LaTeX de l’expression SymPy |
| `input_matrix` | un texte par case, converti comme pour `input_text` |
| `input_vmatrix` | idem ; la grille prend les dimensions de la solution |

Quand plusieurs réponses sont justes, une valeur peut être déclarée libre avec
`LIBRE` (fourni par `pywims`), y compris dans une `Matrix` :

```python
from pywims import LIBRE
solution = Matrix(n, n, lambda i, j: 0 if i > j else LIBRE)
```

Une case libre affiche « ∗ » dans un style neutre (bordure en pointillés,
sans couleur de correction).

### 2.4 Contrôles à la compilation

Le compilateur refuse l’exercice, avec un message précis, si :
- une balise n’a pas de `solution=` ou désigne une variable absente ;
- la solution n’a pas la forme attendue par le champ (dimensions de matrice) ;
- un nom de champ est déjà défini par `avant`, ou réservé (`ok_answer`,
  `feedback`, noms du module `pywims`, mots-clés Python) ;
- une chaîne de `avant` ou de `apres` contient un caractère de contrôle autre
  que le retour à la ligne : c’est presque toujours une formule TeX écrite dans
  une chaîne ordinaire (`'\frac'` contient un saut de page, `'\times'` une
  tabulation), qu’il faut écrire en chaîne brute `r'…'` (le champ et la ligne
  sont indiqués) ;
- `avant` lève une exception pour l’un des tirages (la graine est indiquée) ;
- une question à choix ne respecte pas les règles du § 10.6.

### 2.5 Exemple

```
%
% title
%
Dérivée d’un polynôme
%
% keywords
%
dérivée, fonction polynomiale, calcul différentiel
%
% layout
%
STD
%
% avant
%
from random import choice, randint
from sympy import symbols, expand, diff, simplify
from pywims import math_expression

x = symbols("x")
a = choice([-4, -3, -2, -1, 1, 2, 3, 4])
b, c, d = randint(-5, 5), randint(-5, 5), randint(-5, 5)
fonction = expand(a*x**3 + b*x**2 + c*x + d)
derivee = diff(fonction, x)
%
% enonce
%
Soit la fonction polynomiale $f(x) = {{ fonction }}$.
Donnez sa dérivée $f'(x)$ :
{% input_math 'derivee_eleve' solution=derivee %}
%
% apres
%
reponse_eleve = math_expression(derivee_eleve)
ok_answer["derivee_eleve"] = reponse_eleve is not None and simplify(reponse_eleve - derivee) == 0
if ok_answer["derivee_eleve"]:
    feedback = "Bravo, cette dérivée est correcte !"
else:
    feedback = r"Ce n’est pas la bonne dérivée. Dérivez terme à terme avec $(x^n)' = n\,x^{n-1}$."
%
```

Le retour explique l’erreur sans donner la réponse : c’est le rôle du bouton
« Solution ».

## 3. Compilation

- Le compilateur charge Pyodide (version **0.27.7**, la même que le fichier
  généré, pour que le rendu LaTeX soit identique).
- Pour chaque question, il exécute **20 tirages**. Chaque tirage part d’un
  espace de noms neuf, initialisé avec une graine (`random.seed`, et
  `numpy.random.seed` si NumPy est importé), puis exécute `avant`.
- Un tirage enregistre :
  - `seed` : la graine ;
  - `context` : la valeur affichée de chaque `{{variable}}` de l’énoncé et de
    chaque dimension de matrice (des chaînes, comme aujourd’hui) ;
  - `solutions` : la valeur convertie de chaque champ (§ 2.3) ;
  - `explication` : le texte de `explication_solution`, s’il est défini.
- Les tirages identiques (même `context` et mêmes `solutions`) sont fusionnés.
  Une question sans aléatoire n’a donc qu’un tirage.
- Les tirages sont intégrés au fichier généré en JSON, dans un bloc de texte
  échappé, comme les autres champs. Pas de compression, pas de minification :
  le Python doit garder son indentation.
- Versions figées : MathJax **3.2.2**, MathLive **0.111.0**. Le widget MathLive
  passe à l’attribut `math-virtual-keyboard-policy`.
- La compilation est refusée si le module `pywims` chargé par la page du
  compilateur diffère de celui de `runtime/python.js` dans le dossier du projet
  (page restée en cache) : les tirages ne seraient pas reproductibles.
- **Aperçu.** La page réelle de l’exercice s’affiche dans un cadre isolé
  (`sandbox="allow-scripts"`), sans Python et avec des boutons inactifs :
  d’abord un tirage provisoire où chaque variable porte son nom, puis un tirage
  réel calculé par le Python de la page du compilateur, chargé une seule fois et
  gardé en mémoire pour chaque exercice.

## 4. Structure du fichier généré

- Un seul document, sans iframes. Une question seule est une feuille à une
  question, avec la mise en page « question seule ».
- Chaque question est une `<section>` ; ses identifiants sont préfixés
  (`q2-…`) et elle a sa propre session Python dans l’instance Pyodide commune.
- Les styles de la feuille sont dans `css/exercise.css` et n’utilisent que les
  variables de `css/brand.css`. Plus de CSS codé en dur dans `compiler.js`.
- Le mode « pages séparées (ZIP) » produit une feuille à une question par
  fichier.

## 5. Comportement à l’exécution

### 5.1 Ouverture

1. Pour chaque question, un tirage est choisi au hasard. Son énoncé est rendu
   tout de suite à partir de `context`.
2. MathJax compose les formules. MathLive n’est chargé que si une question en a
   besoin.
3. En arrière-plan : chargement de Pyodide et des paquets détectés, puis, pour
   chaque question, exécution de `avant` avec la graine du tirage.
4. Contrôle : le `context` recalculé doit être identique au `context` stocké.
   Sinon la question affiche une erreur et ne peut pas être vérifiée.
5. Si l’élève clique « Vérifier ma réponse » avant que Python soit prêt, la
   vérification attend la fin du chargement, avec un indicateur dans le bouton.

### 5.2 Cycle de vie d’une question

| État | Boutons visibles |
|---|---|
| Saisie | Vérifier ma réponse (grisé tant qu’aucun champ ouvert n’est rempli) · Solution · Nouvel énoncé |
| Vérifiée, avec erreur | Corriger ma réponse · Solution · Nouvel énoncé |
| Vérifiée, tout juste | Nouvel énoncé |
| Solution affichée | Nouvel énoncé |

- **Vérifier ma réponse** : les saisies sont transmises à Python (y compris
  celles des champs déjà verts), `apres` est exécuté, puis chaque champ ouvert
  se colore et le retour s’affiche.
- **Corriger ma réponse** : retour à la saisie sur le même tirage. Les champs
  justes restent verts et figés ; les champs faux sont rouverts avec la saisie
  de l’élève.
- **Solution** : tous les champs, y compris ceux déjà justes, sont remplis avec
  leur solution et passent au vert (ou « ∗ » neutre pour une valeur libre). Si le tirage a une
  `explication_solution`, elle remplace le retour dans son emplacement, avec la
  même animation et une couleur neutre (bleu marine de la charte) ; sinon
  l’emplacement est vidé. Le texte est échappé ; ses formules sont composées
  par MathJax.
- **Nouvel énoncé** : un autre tirage (différent du tirage courant si possible)
  remplace l’énoncé instantanément ; la session Python correspondante est
  recalculée en arrière-plan.

### 5.3 Progression

- Une question est **réussie** quand une vérification de l’élève est
  entièrement juste. Elle le reste ensuite, même après un nouvel énoncé.
- Une question complétée par « Solution » n’est pas réussie.
- La barre de titre de l’activité affiche le pourcentage de questions réussies
  (même poids pour chaque question) et une barre de progression. Une question
  seule n’affiche pas de progression.

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
  que les précédents (la carte ne rétrécit jamais).

### 5.5 Animations

- Champ corrigé ou rempli par la solution : il se replie, change de couleur et
  se redéplie avec un léger rebond ; les cases d’une matrice se suivent.
- Retour : apparition `growIn` existante.
- Question réussie : le numéro devient ✓ avec un effet de rebond.
- Progression : barre et pourcentage animés ; confettis à 100 %.
- Nouvel énoncé : fondu de l’énoncé.
- Tout est remplacé par des changements directs si l’appareil demande des
  mouvements réduits.

### 5.6 Aide de l’élève

- Un bouton « ? » dans l’en-tête ouvre une fenêtre d’aide : le rôle des quatre
  boutons (Vérifier, Corriger, Solution, Nouvel énoncé), avec leurs icônes.
- Dans une activité, l’aide explique aussi le pourcentage : part des questions
  réussies par l’élève lui-même, une solution affichée ne compte pas, une
  réussite reste acquise après un nouvel énoncé, même poids pour chaque
  question.
- Le même texte, abrégé, apparaît en bulle au survol, au focus ou au toucher du
  pourcentage.

## 6. Organisation du code

| Fichier | Rôle |
|---|---|
| `runtime/template.js` (nouveau) | grammaire unique des balises et échappement HTML, utilisés par le compilateur (validation, aperçu) et par le fichier généré (rendu) |
| `runtime/python.js` | Pyodide partagé, sessions par question, module `pywims`, graines, détection des paquets |
| `runtime/runner.js` | classe `Question` (rendu, cycle de vie) et progression de la feuille |
| `widgets/*.js` | champs de saisie, avec pré-remplissage pour la solution |
| `layouts/standard.html` | mise en page commune aux feuilles et aux questions seules |
| `css/exercise.css` | styles des feuilles, à partir des variables de `brand.css` |
| `compiler/compiler.js` | tirages avec Pyodide, contrôles, assemblage |

Supprimés : les iframes, la scrutation toutes les 500 ms et le rechargement
de la page pour recommencer.

## 7. Migration des exercices

- **Automatique** : suppression des champs `reponse` (ou `feedback`),
  `libraries` et `ggb_commands`, `py_wims_math_expression` → `math_expression`,
  ajout des imports explicites (version prudente :
  `from sympy import *`, les fonctions de `random` utilisées et les outils
  `pywims`).
- **Manuelle** : `solution=` sur chaque balise, réécriture des retours qui
  donnent la réponse, suppression de l’indice de `pgcd.pwq`.
  `matrice-triangulaire.pwq` utilise `LIBRE` au-dessus de la diagonale, avec
  une `explication_solution`.
- `PROMPT.md` est mis à jour avec le nouveau format.
- L’export des exercices de la base Django PyWims vers des fichiers `.pwq` est
  un sous-projet distinct, traité plus tard.

## 8. Tests

- Quand une modification fait échouer un test par recherche de chaîne, il est
  remplacé par un test de comportement.
- Nouveaux tests : analyse des balises (`template.js`), contrôles de
  compilation, cycle de vie d’une question (sans Python), et une compilation
  réelle avec Pyodide de chaque exercice du dépôt.

## 9. Étapes de développement

Chaque étape laisse le projet fonctionnel et se teste avant la suivante.

1. **`template.js`** : grammaire unique, `solution=` reconnu, échappement
   commun. Aucun changement visible.
2. **Versions figées** de MathJax et MathLive, attribut MathLive corrigé.
3. **Format v2 et module `pywims`** : imports explicites, détection des
   paquets, graines, renommage `feedback` ; migration des 5 exercices.
4. **Tirages dans le compilateur** : Pyodide, 20 tirages, contrôles, données
   intégrées. Le runtime actuel les ignore encore.
5. **Nouveau runtime** : affichage immédiat, Python en arrière-plan, cycle de
   vie complet, mise en page « question seule ».
6. **Activité en un seul document** : assemblage sans iframes, progression,
   mode ZIP adapté.
7. **Finitions** : animations, README et `PROMPT.md`.

## 10. Questions à choix

Les questions à choix unique ou multiple suivent le modèle des autres champs :
les choix et la solution sont calculés par `avant`, la correction est écrite
dans `apres`. Le compilateur n’analyse pas le LaTeX d’AMC : la conversion d’une
question AMC en fichier `.pwq` est confiée à un LLM, guidé par `PROMPT.md`
(§ 10.8).

### 10.1 Balises

```
{% input_radio 'reponse' choices=choix solution=bonne %}
{% input_checkbox 'reponses' choices=choix solution=bonnes columns=2 fixed_last=1 bareme='b=1,m=-0.5' %}
```

| Attribut | Statut | Rôle |
|---|---|---|
| `choices` | obligatoire | variable de `avant` : liste des choix, dans l’ordre de l’auteur |
| `solution` | obligatoire | `input_radio` : indice du bon choix ; `input_checkbox` : liste des indices des bons choix, vide si aucun choix n’est bon |
| `columns` | facultatif | nombre de colonnes sur grand écran, de 1 (par défaut) à 6 |
| `fixed_last` | facultatif | nombre de derniers choix qui restent à la fin, non mélangés (par défaut 0) |
| `bareme` | facultatif | barème à la manière d’AMC (§ 10.5) |

Les indices commencent à 0, dans l’ordre de la liste `choices`.

Un choix est un texte (formules TeX admises), échappé comme une valeur
`{{variable}}`, ou un objet SymPy, affiché comme une formule. L’énoncé de la
question s’écrit dans `enonce`, avant la balise, comme pour les autres champs.

Aucun choix n’est ajouté automatiquement. Le concepteur qui veut un choix
« Aucune de ces réponses » l’écrit lui-même en dernier, avec `fixed_last=1` ;
c’est un choix comme les autres, qui n’exclut pas les autres cases.

### 10.2 Tirages

- Pour chaque tirage, le compilateur enregistre les textes des choix et leur
  ordre d’affichage. L’ordre est mélangé avec la graine du tirage, sans
  utiliser le `random` de l’auteur ; les `fixed_last` derniers choix restent à
  la fin, dans leur ordre.
- Les textes des choix font partie des valeurs affichées : le navigateur les
  recalcule et les compare comme le `context` (§ 5.1).
- Deux tirages qui ne diffèrent que par l’ordre des choix restent distincts :
  « Nouvel énoncé » mélange alors les choix d’une question sans aléatoire.

### 10.3 Correction

- `apres` reçoit sous le nom du champ l’indice choisi (`input_radio`) ou la
  liste croissante des indices cochés (`input_checkbox`, `[]` si rien n’est
  coché), dans l’ordre de l’auteur : le mélange est invisible pour lui.
- `apres` décide de la réussite par `ok_answer['nom']`, comme pour les autres
  champs. Un choix multiple est juste en tout ou rien.
- `explication_solution` joue le rôle de `\explain` d’AMC.

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
- **Solution.** Les bons choix sont cochés et verts, les autres décochés et
  neutres ; le groupe est figé.
- Rien ne bouge : seules les couleurs, les icônes et l’état des cases changent.
  Les choix colorés s’animent l’un après l’autre, comme les cases d’une matrice.

### 10.5 Barème et note

Il n’y a pas de barème par défaut (pas d’équivalent de `\baremeDefautS` ou
`\baremeDefautM`) : sans attribut `bareme`, aucune note n’est affichée. Le
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
  l’entraînement, pas une évaluation.

### 10.6 Contrôles à la compilation

En plus du § 2.4, le compilateur refuse l’exercice si, pour l’un des tirages :
- `choices` n’est pas une liste d’au moins deux choix ;
- `solution` n’est pas un indice valide (`input_radio`) ou une liste
  d’indices valides et distincts (`input_checkbox`) ;
- `fixed_last` est supérieur ou égal au nombre de choix, ou `columns` sort de
  1 à 6 ;
- le barème contient une directive inconnue ou refusée, ou une valeur non
  numérique, ou la question contient d’autres champs.

### 10.7 Activité et affichage

- La réussite d’une question reste en tout ou rien et seule compte dans le
  pourcentage (§ 5.3).
- Si au moins une question a un barème, la barre de titre de l’activité
  affiche aussi une **note indicative**, à côté du pourcentage : la somme des
  notes des questions notées sur la somme de leurs maxima, avec « sur k questions notées » si certaines n’ont pas de barème. La
  note d’une question est celle de sa dernière vérification ; elle vaut 0
  avant toute vérification et revient à 0 après « Nouvel énoncé », mais pas
  après « Solution ». L’aide (§ 5.6) l’explique.
- Chaque choix est une ligne entière cliquable d’au moins 44 px de haut, dans
  un `fieldset`. Avec `columns=n`, les choix forment une grille de n colonnes
  de même largeur ; sur écran étroit, le nombre de colonnes diminue pour que
  chaque choix garde une largeur minimale (environ 8 em), puis tant qu’un
  choix ne tient pas dans sa colonne : un mot ou une formule n’est jamais
  coupé ni masqué, ce qui changerait le sens du choix. Des choix courts
  restent ainsi côte à côte sur téléphone.

### 10.8 Conversion depuis AMC

`PROMPT.md` reçoit une section « Convertir une question AMC » :
- `question` → `input_radio`, `questionmult` → `input_checkbox` ;
- `\bonne` et `\mauvaise` → la liste `choices` et les indices de `solution` ;
- la case « Aucune de ces réponses » ajoutée par l’option `completemulti`
  d’AMC → un dernier choix écrit explicitement, avec `fixed_last`, qui fait
  partie de la solution quand aucun autre choix n’est bon ;
- `\lastchoices` → `fixed_last`, `reponseshoriz` → `columns`, `\explain` →
  `explication_solution`, `\bareme{…}` → `bareme='…'` ; un barème par défaut
  (`\baremeDefautS`, `\baremeDefautM`) est recopié dans chaque question
  concernée ;
- calculs (`\FPeval`, macros) → Python dans `avant` ;
- transposition du texte (`\textbf` → `<b>`, `\og…\fg` → « … », formules
  conservées) ;
- une question AMC par fichier `.pwq` ;
- tout ce qui ne se transpose pas (image, question ouverte, barème refusé…)
  est signalé, pas approximé ;
- un exemple complet, du source AMC au fichier `.pwq`.

### 10.9 Étapes

1. **Format et tirages** : balises dans `template.js`, conversion et contrôles
   dans `pywims`, choix, ordre et solutions dans les tirages ; prise en charge
   par `balayage.py`.
2. **Widget et cycle de vie** : rendu, colonnes, vérification, correction,
   solution, animations.
3. **Barème** : calcul de la note, affichage sous le retour, note indicative
   de l’activité, aide.
4. **Documentation** : `PROMPT.md` (format et conversion AMC), README, un
   exercice d’exemple converti depuis AMC.

## 11. Points ouverts

- **Banque de questions** (comme `\element` et `\restituegroupe` d’AMC) : une
  question de l’activité serait un groupe de fichiers `.pwq`, chaque tirage
  appartenant à l’un d’eux. Chantier ultérieur.
- **Graphiques matplotlib** dans les énoncés, produits en SVG à la
  compilation. Chantier ultérieur.
