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
```

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
- `avant` lève une exception pour l’un des tirages (la graine est indiquée).

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

## 10. Points ouverts

Aucun pour l’instant.
