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
`enonce` et `apres`. Ils sont tous obligatoires et non vides.
N’insère pas de ligne contenant uniquement `%` dans le contenu d’un champ.
N’utilise pas les anciens champs `libraries`, `ggb_commands`, `reponse` ou
`feedback`.

Tout le contenu destiné à l’élève doit être en français, y compris le titre,
les mots-clés, l’énoncé et les messages de correction. Écris les mots-clés en
français, séparés par des virgules.

## Python

- Le code Python va dans `avant` (tirage aléatoire et calcul des solutions) et
  dans `apres` (correction). `apres` voit toutes les variables de `avant`.
- Rien n’est importé d’office : commence `avant` par les imports nécessaires,
  par exemple `from random import randint, choice` et `from sympy import *`.
- Tire le hasard uniquement avec le module `random` (ou `numpy.random`) : le
  compilateur calcule 20 tirages avec des graines fixes, puis le navigateur
  rejoue le tirage affiché avec la même graine. Une autre source de hasard
  (heure, `secrets`…) rendrait le tirage impossible à reproduire.
- Les outils PyWims s’importent depuis le module `pywims` :
  `from pywims import py_wims, is_nombre, math_expression, LIBRE`.
  - `math_expression(saisie)` analyse une expression écrite par un élève
    (`2x`, `x^2`, `sqrt(2)`) avec une grammaire restreinte, sans exécuter de
    code, et renvoie une expression SymPy ou `None`. Utilise-la pour toute
    saisie qui peut contenir une expression.
  - `py_wims(saisie)` convertit une saisie simple (nombre, fraction) en objet
    SymPy, ou renvoie `None`.
  - `is_nombre(valeur)` indique si une valeur est un nombre.
- Dans `apres`, affecte `True` ou `False` à `ok_answer['nom_du_champ']` pour
  chaque champ. Pour une matrice, ajoute une entrée par case, nommée exactement
  `ok_answer["nom_du_champ[{}][{}]".format(i, j)]`.
- Définis aussi dans `apres` la variable `feedback`, le retour affiché à
  l’élève (formules TeX admises). Elle est facultative : sans elle, le retour
  est « Bravo, c’est exact ! » ou « Certaines réponses sont incorrectes. ».

## Énoncé et champs de saisie

- Dans `enonce`, utilise `{{variable}}` pour afficher une valeur de `avant`.
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
- Le nom d’un champ est aussi le nom de la variable Python qui reçoit la
  saisie dans `apres` (une chaîne, ou une liste de listes de chaînes pour une
  matrice). Il ne doit pas reprendre un nom de `avant`, ni `ok_answer`,
  `feedback`, `explication_solution`, un outil de `pywims` ou un mot-clé Python.

## Solution

- Le bouton « Solution » remplit tous les champs avec leur solution, y compris
  ceux que l’élève avait justes. Pour une matrice, la solution est une `Matrix`
  ou une liste de lignes.
- Quand plusieurs réponses sont justes, marque les valeurs quelconques avec
  `LIBRE` : elles s’affichent « ∗ ». Exemple pour une matrice triangulaire :
  `solution_matrice = Matrix(n, n, lambda i, j: 0 if i > j else LIBRE)`.
- Tu peux définir dans `avant` une variable `explication_solution` (texte,
  formules TeX admises), affichée avec la solution pour l’éclairer.

## Retour à l’élève

La variable `feedback` explique l’erreur sans donner la réponse : la réponse est le rôle du
bouton « Solution ». Par exemple « 6 est bien un diviseur commun, mais ce n’est
pas le plus grand » plutôt que « la réponse était 12 ».

N’invente pas de mises en page, de composants, d’API d’exécution ni de
bibliothèques Python. La seule mise en page prise en charge est `STD`.
N’utilise pas d’autres balises ou filtres Django. Si l’exercice demandé
nécessite une fonctionnalité non prise en charge, signale-le séparément au lieu
de proposer une approximation silencieuse.

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
