# Spécification — feuilles d’exercices et tirages précalculés

Ce document décrit PyWimsOnHTML tel qu’il est. Il sert de référence : une
modification commence par lui, avant le code (§ 9).

## 1. Objectifs

1. L’énoncé s’affiche dès l’ouverture du fichier, sans attendre Python.
2. Une question sans `apres` se corrige sans Python, par comparaison avec sa
   solution (§ 2.6) : c’est le cas courant des questions à choix. Seules les
   questions qui ont un `apres` chargent Pyodide, en arrière-plan, et leur
   correction par Python reste complète.
3. Une activité est une feuille d’exercices compacte dans une seule page :
   un seul chargement de Pyodide, MathJax et MathLive pour toutes les questions.
4. L’apparence suit la charte (§ 11.4) : la charte neutre `css/brand.css`, ou
   le `brand.css` du dossier d’exercices, y compris pour les activités.
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
| `title`, `keywords`, `layout` | obligatoire | titre, mots-clés (séparés par des virgules), mise en page (`STD`) |
| `avant` | obligatoire | tirage et calcul des solutions |
| `enonce` | obligatoire | modèle de l’énoncé |
| `apres` | facultatif | correction ; sans lui, chaque champ est corrigé par comparaison avec sa solution (§ 2.6) |
| `tirages` | facultatif | nombre de tirages calculés à la compilation, entier de 1 à 200 ; 20 par défaut (§ 3) |

Le retour destiné à l’élève est la variable `feedback` de `apres` (§ 2.2).
Les paquets Pyodide sont déduits des `import` du code. Un champ inconnu est
refusé.

### 2.2 Python

- Chaque exercice importe explicitement ce qu’il utilise :
  `import sympy as sp`, `from sympy import …`, `import random`, etc.
- Les outils PyWims viennent d’un module dédié :
  `from pywims import py_wims, is_nombre, math_expression, decimal_fr`.
  Ses fonctions internes ne sont pas visibles par l’auteur, qui ne peut donc
  pas les perturber (par exemple en écrivant `E = 3`).
- `apres` partage l’espace de noms de `avant` et y trouve les saisies de
  l’élève sous le nom de chaque champ.
- Contrat de sortie de `apres` : `ok_answer[nom_du_champ] = True/False` pour
  chaque champ (`"matrice[i][j]"` pour une case), et, facultativement, une
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
- Variable facultative de `avant` : `explication_solution`, un texte (formules
  TeX admises) affiché avec la solution (§ 5.2).
- Pour lire une saisie qui contient une expression (champ texte ou case de
  matrice), utiliser `math_expression` plutôt que `py_wims` : elle accepte
  l’écriture des élèves (`2x`, `x^2`, `sin x`, `ln(x)`) et renvoie `None` pour
  une saisie invalide. Elle s’appuie sur l’analyseur de SymPy (`parse_expr`,
  avec produit implicite, `^` pour la puissance et décimaux convertis en
  fractions), précédé d’un filtre : seuls les chiffres, les lettres, les
  espaces et `+ - * / ^ ( ) .` sont admis, et `//` est refusé. Sans `_`,
  guillemets, crochets ni virgule, une saisie ne peut appeler que les fonctions
  admises (`sin`, `cos`, `tan`, `exp`, `log`, `ln`, `sqrt`) ; les autres noms
  sont des symboles, et `e` et `pi` les constantes.

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

**Conversion de la solution.** À la compilation, pour chaque tirage, la
valeur Python de la variable de solution (calculée par `avant`) est convertie
en la valeur que le bouton « Solution » écrit dans le champ. Cette valeur
convertie est enregistrée dans le tirage (`solutions`, § 3) ; le navigateur
n’a pas besoin de Python pour l’afficher.

| Champ | Valeur Python (entrée) | Valeur écrite dans le champ (sortie) |
|---|---|---|
| `input_text` | nombre, expression SymPy ou texte | le texte qu’un élève taperait : `Rational(19, 12)` → `19/12`, `x**2 + 1` → `x^2 + 1`, `'oui'` → `oui` |
| `input_math` | expression SymPy | son code LaTeX, affiché par MathLive : `Rational(19, 12)` → `\frac{19}{12}` |
| `input_matrix` | `Matrix` ou liste de lignes | un texte par case, converti comme pour `input_text` |
| `input_vmatrix` | idem | idem ; la grille prend les dimensions de la solution |
| `input_radio`, `input_checkbox` | indice, ou liste d’indices | les choix correspondants sont cochés (§ 10) |

Quand plusieurs réponses sont justes, une valeur peut être déclarée libre avec
`LIBRE` (fourni par `pywims`), y compris dans une `Matrix` :

```python
from pywims import LIBRE
solution = Matrix(n, n, lambda i, j: 0 if i > j else LIBRE)
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
  matrice. Le pavé décimal, plus rapide pour des chiffres, n’a sur iPhone ni
  signe moins, ni barre de fraction, ni lettre, et seulement le séparateur
  décimal de la langue du téléphone : `-1`, `1/2` ou `0.5` y seraient
  impossibles à taper. Le prix est une saisie des chiffres un peu plus lente
  (page « 123 » du clavier). Un choix du clavier par l’auteur pourra être
  ajouté plus tard, si le besoin apparaît.

Les champs MathLive ont leur propre clavier virtuel et ne sont pas concernés.

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
- l’exercice est incohérent pour l’un des tirages : la solution, saisie comme
  par un élève, est jugée fausse par `apres`, ou `apres` lève une exception
  (§ 3, « Cohérence ») ;
- une question à choix ne respecte pas les règles du § 10.6.

Il **avertit** sans refuser, dans la ligne d’état de l’aperçu et après la
compilation, si l’énoncé contient trois accolades de suite
(`\frac{{{n}}}{{{m}}}`) : cela fonctionne, mais se relit mal ; on écrit
`\frac{ {{n}} }{ {{m}} }`, avec le même résultat.

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

### 2.6 Correction par défaut

Chaque champ désigne sa solution : `apres` est facultatif. Sans lui, chaque
saisie est comparée à la solution du tirage, en JavaScript, sans Python.
`apres` ne sert qu’aux corrections particulières (plusieurs écritures justes,
valeur numérique approchée) et aux retours ciblés.

**Principe : sans `apres`, l’élève doit donner ce qu’affiche le bouton
« Solution ».** L’auteur le vérifie dans l’aperçu du compilateur.

- **Avec `apres`** : `apres` décide seul de la réussite de chaque champ. Pas de correction partielle : `ok_answer` n’est pas pré-rempli
  par la correction par défaut.
- **Python** n’est chargé que par les questions qui ont un `apres` (§ 5.1).

| Champ | Saisie juste si |
|---|---|
| `input_radio` | le choix est celui de la solution |
| `input_checkbox` | les cases cochées sont exactement celles de la solution |
| futur glisser-déposer | chaque élément est à la place de la solution |
| `input_text`, case de matrice | le texte saisi est celui de la solution (§ 2.3), aux différences typographiques près (ci-dessous) |
| `input_vmatrix` | la grille a les dimensions de la solution, et chaque case est juste ; avec d’autres dimensions, toutes les cases sont fausses |
| valeur `LIBRE` | la saisie n’est pas vide |
| `input_math` | pas de correction par défaut : `apres` est obligatoire (ci-dessous) |

Les questions à choix (et plus tard le glisser-déposer) sont le cas principal
sans `apres` : la comparaison y est sans ambiguïté.

- **Différences typographiques ignorées** pour un champ texte : les espaces
  (`x^2+1` est juste pour `x^2 + 1`, `1 000` pour `1000`), le signe moins
  typographique « − » (U+2212, fréquent sur téléphone et dans les
  copier-coller) et le codage des accents (forme NFC : un « é » en un ou deux
  caractères). Tout le reste compte : majuscules (`A` et `a` sont deux objets
  mathématiques), ordre des termes (`1 + x^2` est faux pour `x^2 + 1`),
  fractions équivalentes (`14/24` pour `7/12`), séparateur décimal.
- **Séparateur décimal.** Aucune équivalence entre la virgule et le point : en
  anglais la virgule sépare les milliers, et en mathématiques elle sépare des
  éléments (`(1, 5)` n’est pas `(1.5)`). L’élève écrit le séparateur que montre
  la solution. Un flottant s’affiche comme Python l’écrit (`0.3`), après
  arrondi à 12 chiffres significatifs, qui efface les artefacts de calcul
  (`0.1 + 0.2` donne `0.3`, et non `0.30000000000000004`). Pour une écriture
  française, l’auteur donne une solution texte, par exemple avec l’outil
  `decimal_fr(x, 2)` du module `pywims`, qui renvoie `"1,41"`.
- **Plusieurs écritures justes** (ordre des termes, fraction non simplifiée,
  valeur approchée) : l’auteur écrit `apres`. `PROMPT.md` le dit.
- **Retour.** Le texte générique du § 2.2 (« Réponse incorrecte. » pour une
  question qui n’attend qu’une réponse). Un indice qui ne dépend pas de la
  réponse de l’élève peut aller dans `explication_solution`, affichée avec la
  solution.
- **`input_math` exige un `apres`**, et le compilateur le dit. Une
  formule ne se compare pas à l’écriture de sa solution ; essai fait sur 23
  cas, en passant la solution et une frappe d’élève par MathLive :
  - SymPy, et non l’auteur, choisit l’écriture de la solution : `(x+1)/2`
    devient `x/2 + 1/2`, `ln(x)` devient `\log(x)`, et l’ordre des termes est
    le sien ; l’élève devrait deviner ces conventions ;
  - MathLive garde des traces de la frappe (un numérateur tapé entre
    parenthèses les conserve) ;
  - ignorer les espaces confondrait le produit `p i` et le nombre π.

  Surtout, pour une formule, l’enseignant attend presque toujours une
  expression égale, pas une écriture : c’est une comparaison symbolique, donc
  Python. Des outils `pywims` pour l’écrire en une ligne viendront plus tard.
- **Code partagé.** Les règles sont dans `runtime/correction.js`, intégré au
  fichier généré et utilisé aussi par le compilateur pour le contrôle de
  cohérence (§ 3) : la solution doit être jugée juste par la correction par
  défaut, ce qui vérifie notamment la normalisation. Une solution texte vide
  (ou faite d’espaces) est refusée : l’élève ne pourrait pas la saisir, car
  « Vérifier » reste inactif tant qu’aucun champ n’est rempli.

## 3. Compilation

- Le compilateur charge Pyodide (version **0.27.7**, la même que le fichier
  généré, pour que le rendu LaTeX soit identique).
- Pour chaque question, il exécute **20 tirages**, ou le nombre du champ
  `tirages` : moins pour un exercice peu varié (inutile de calculer 20 fois les
  mêmes valeurs), plus pour qu’un élève qui s’entraîne longtemps revoie moins
  souvent le même énoncé, au prix d’un fichier plus lourd. Chaque tirage part d’un
  espace de noms neuf, initialisé avec une graine (`random.seed`, et
  `numpy.random.seed` si NumPy est importé), puis exécute `avant`.
- **Hachage fixe.** Pyodide est lancé avec `PYTHONHASHSEED=0`, à la compilation
  comme dans le fichier généré. Sinon le hachage des chaînes change à chaque
  chargement de Pyodide, et avec lui l’ordre d’un `set` de chaînes (mesuré :
  `{"pomme", "poire", "kiwi", "figue"}` sort dans un ordre différent d’une
  instance à l’autre) : `choice(list(un_ensemble))` donnerait un autre tirage
  dans le navigateur qu’à la compilation.
- **Calcul trop long.** Chaque exécution de `avant`, et de `apres` pour le
  contrôle de cohérence, est limitée à **30 s** (comptées comme au § 5.1).
  Au-delà, la compilation s’arrête : « « avant » n’a pas terminé en 30 s pour
  la graine 7 (boucle sans fin ?) ». Le compilateur garde la main et reste
  utilisable. Le premier import des bibliothèques de l’exercice (SymPy :
  quelques secondes, bien plus sur un navigateur lent) n’est pas compté : il
  est fait au chargement des paquets, avant toute exécution limitée.
- **Reproductibilité.** Chaque graine est exécutée deux fois, dans deux espaces
  de noms neufs ; les deux tirages (`context`, `solutions`, choix,
  explication) doivent être identiques. Sinon la compilation est refusée :
  « avant » utilise un hasard que la graine ne fixe pas (heure,
  `numpy.random.default_rng()`, `secrets`…), et le navigateur ne pourrait pas
  rejouer le tirage. L’erreur apparaît ainsi chez l’auteur, et non chez
  l’élève (« … diffère », § 5.1).
- Un tirage enregistre :
  - `seed` : la graine ;
  - `context` : la valeur affichée de chaque `{{variable}}` de l’énoncé et de
    chaque dimension de matrice, en texte ; un objet SymPy est écrit en LaTeX
    (matrices entre crochets), sans `\displaystyle` : l’auteur choisit la
    taille des formules (`$\displaystyle {{f}}$`, ou `$$ {{f}} $$`) ;
  - `solutions` : la valeur convertie de chaque champ (§ 2.3) ;
  - `explication` : le texte de `explication_solution`, s’il est défini.
- **Cohérence.** Pour chaque tirage, dans le même espace de noms, le
  compilateur saisit la solution de chaque champ comme le ferait un élève,
  exécute `apres` (ou, sans `apres`, la correction par défaut du § 2.6) et
  exige `ok_answer` vrai pour chaque champ (et chaque case d’une matrice).
  Sinon la compilation est refusée avec la graine, le champ et
  le `feedback` obtenu, par exemple « Graine 7 : la solution du champ « r » est
  jugée fausse par « apres » ». Ainsi le bouton « Solution » ne montre jamais
  une réponse que la correction refuse, et `apres` ne plante pour aucun tirage.
  Saisie utilisée :
  - `input_text`, case de matrice : le texte de la solution (§ 2.3) ;
  - `input_math` : la solution écrite comme pour `input_text` (`x^2 + 1`),
    proche de ce que MathLive transmet ;
  - valeur `LIBRE` : `1`, une valeur quelconque ;
  - `input_vmatrix` : une grille aux dimensions de la solution ;
  - champ à choix : l’indice ou la liste des indices de la solution.
  Les tests appliquent ce contrôle aux exemples du dépôt, sur 20 tirages ou
  plus (`?tirages=200`, § 8).
- Les tirages identiques (même `context` et mêmes `solutions`) sont fusionnés.
  Une question sans aléatoire n’a donc qu’un tirage.
- Les tirages sont intégrés au fichier généré en JSON, dans un bloc de texte
  échappé, comme les autres champs. Pas de compression, pas de minification :
  le Python doit garder son indentation.
- Les scripts et styles du projet sont intégrés tels quels dans des balises
  `<script>` et `<style>`. L’assemblage refuse un fichier qui contient
  `</script` (ou `</style` pour une feuille de style) : le navigateur y
  fermerait la balise et la page serait cassée sans message. On refuse au lieu
  d’échapper, car `<\/script` modifierait le texte du module `pywims`, intégré
  tel quel dans son bloc `<script type="text/x-python">`.
- Versions figées : MathJax **3.2.2**, MathLive **0.111.0**. Le widget MathLive
  passe à l’attribut `math-virtual-keyboard-policy`.
- **Module `pywims`.** C’est un vrai fichier Python, `runtime/pywims.py`. Le
  compilateur le lit en ligne avec les autres fichiers du projet (§ 11.1), au
  début de chaque compilation, l’installe dans son Pyodide pour
  calculer les tirages, et l’intègre tel quel au fichier généré (bloc
  `<script type="text/x-python" id="pywims-module">`, que le navigateur
  n’exécute pas), seulement si une question a un `apres`. Tirages calculés et
  tirages rejoués utilisent donc le même module : une page du compilateur
  restée en cache ne peut plus les désaccorder. Un module modifié depuis la
  compilation précédente remplace le module déjà chargé.
- **Script du Worker.** Le code du Web Worker de Python est un vrai fichier,
  `runtime/python-worker.js`, et non le texte d’une fonction de `python.js`
  (une telle fonction ne pouvait utiliser aucune variable de son fichier, piège
  que les outils ne signalent pas). Il suit le chemin du module `pywims` : le
  compilateur le lit en ligne avec les autres fichiers et le donne à `python.js`
  (`setWorkerSource`), les tests aussi, et le fichier généré l’intègre tel
  quel dans un bloc `<script type="text/x-worker" id="pywims-worker">`, que
  le navigateur n’exécute pas, seulement si une question a un `apres`.
  `python.js` en fait le script du Worker (Blob), ce qui marche aussi en
  `file://`.
- L’auteur peut ajouter ses propres outils à `pywims.py` ; tout nom exporté
  (`__all__`) doit aussi être un nom réservé de `runtime/template.js`, ce que
  vérifient les tests.
- **Aperçu.** La page réelle de l’exercice s’affiche dans un cadre isolé
  (`sandbox="allow-scripts"`), sans Python et avec des boutons inactifs :
  d’abord un tirage provisoire où chaque variable porte son nom, puis un tirage
  réel calculé par le Python de la page du compilateur, chargé une seule fois et
  gardé en mémoire pour chaque exercice.

## 4. Structure du fichier généré

- Un seul document, sans iframes. Une question seule est une feuille à une
  question, avec la mise en page « question seule ».
- Chaque question est une `<section>` ; ses identifiants sont préfixés
  (`q2-…`) et elle a sa propre session Python dans le Pyodide commun, qui
  tourne dans un Web Worker.
- Une question sans `apres` n’intègre pas son champ `avant` : il ne sert qu’à
  rejouer un tirage dans Python, et elle ne charge jamais Python. Ses tirages
  suffisent (−25 % pour une activité de QCM dont `avant` contient toutes les
  variantes).
- Les styles de la feuille sont dans `css/exercise.css` et n’utilisent que les
  variables de la charte (§ 11.4).
- Le mode « pages séparées (ZIP) » produit une feuille à une question par
  fichier.

## 5. Comportement à l’exécution

### 5.1 Ouverture

1. Pour chaque question, un tirage est choisi au hasard. Son énoncé est rendu
   tout de suite à partir de `context`.
2. MathJax compose les formules. Il n’est chargé (≈ 600 Ko) que si la feuille
   peut en afficher : un délimiteur de formule (`$`, `\(`, `\[`) dans un
   énoncé, une valeur de l’énoncé, un choix ou une explication d’un tirage, ou
   une question qui a un `apres`, dont le retour peut contenir une formule.
   MathLive n’est chargé que si une question en a besoin.
3. Seulement pour une question qui a un `apres` (§ 2.6), et seulement au
   **premier contact** de l’élève avec elle (clic, toucher ou focus dans sa
   carte, ou « Vérifier ma réponse ») : chargement en arrière-plan de Pyodide
   et des paquets détectés, puis exécution de `avant` avec la graine du
   tirage. Un élève qui ne fait que lire la feuille, ou ne travaille que les
   questions sans `apres`, ne télécharge jamais Pyodide. Le chargement n’est
   pas lancé à l’apparition de la question à l’écran : il le serait aussi
   pour une question seulement regardée, alors que l’élève qui commence à
   répondre laisse de toute façon à Pyodide le temps de se charger.
   « Nouvel énoncé » avant ce premier contact ne prépare rien non plus.
4. Contrôle (questions avec Python) : le `context` recalculé doit être
   identique au `context` stocké. Sinon la question affiche une erreur et ne
   peut pas être vérifiée.
5. Si l’élève clique « Vérifier ma réponse » avant que Python soit prêt, la
   vérification attend la fin du chargement, avec un indicateur dans le bouton.
6. **Calcul trop long.** Python tourne dans un Web Worker : la page garde la
   main pendant ses calculs. L’exécution de `apres` par « Vérifier » est
   limitée à **15 s**, comptées à partir du début réel du calcul (pas pendant
   une attente derrière le chargement d’une autre question). Au-delà, le Worker
   est arrêté et un Worker neuf le remplace (≈ 1,5 s, fichiers en cache) ; la
   question affiche « La correction a pris trop de temps : votre réponse est
   peut-être trop complexe. Modifiez-la et vérifiez de nouveau. », et ses champs
   restent modifiables. Toutes les sessions sont perdues : chaque question qui
   a un `apres` se prépare de nouveau (Python, puis `avant` avec la graine) à
   sa prochaine vérification, sans message d’erreur pour celles qui se
   préparaient pendant l’arrêt. Le chargement de Pyodide et des paquets n’est
   pas limité : il dépend de la connexion de l’élève.

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
  l’emplacement est vidé. Le texte suit la règle du retour (§ 2.2) ; ses
  formules sont composées par MathJax.
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
  question. Elle précise que les réussites sont gardées sur cet appareil, et
  que le bouton ↺ de l’en-tête réinitialise la feuille (§ 5.3).
- Le même texte, abrégé, apparaît en bulle au survol, au focus ou au toucher du
  pourcentage.

## 6. Organisation du code

| Fichier | Rôle |
|---|---|
| `runtime/template.js` (nouveau) | grammaire unique des balises et échappement HTML, utilisés par le compilateur (validation, aperçu) et par le fichier généré (rendu) |
| `runtime/correction.js` | correction par défaut sans Python (§ 2.6) : comparaison des choix et des textes, aux différences typographiques près ; utilisée par le fichier généré et par le compilateur |
| `runtime/pywims.py` | module `pywims` : outils de l’auteur, conversion des solutions, contrôles des tirages |
| `runtime/python.js` | Pyodide partagé, dans un Web Worker (la page ne gèle pas, un calcul sans fin peut être arrêté) : création et relance du Worker, appels asynchrones, sessions par question. L’interface reste asynchrone et inchangée pour `question.js` et le compilateur |
| `runtime/python-worker.js` | script du Worker (§ 3) : chargement de Pyodide et des paquets, installation du module `pywims`, graines, exécution du code des sessions |
| `runtime/fields.js` | outils communs sur les champs d’une question : lire et écrire une saisie, figer un champ, choix cochés, animation d’un champ |
| `runtime/question.js` | classe `Question` : rendu d’un tirage, préparation de Python, vérification, correction, solution, nouvel énoncé, note |
| `runtime/sheet.js` | la feuille : création des questions, progression et sa mémoire, note indicative, aide, célébration, redimensionnement |
| `widgets/*.js` | champs de saisie, avec pré-remplissage pour la solution ; le widget de choix retire des colonnes quand un choix déborde |
| `layouts/standard.html` | mise en page commune aux feuilles et aux questions seules |
| `css/exercise.css` | styles des feuilles, à partir des variables de la charte |
| `css/brand.css` | charte neutre, par défaut (§ 11.4) |
| `css/chartes/*.css` | exemples de chartes à copier en `brand.css` dans son dossier d’exercices (UPEC) |
| `compiler/format.js` | analyse d’un fichier `.pwq`, types de ses champs de réponse |
| `compiler/draws.js` | tirages avec Pyodide, contrôles de l’auteur, cohérence, ordre des choix |
| `compiler/assemble.js` | ressources du projet, assemblage des feuilles, empreinte d’une activité |
| `compiler/zip.js` | archive ZIP des pages séparées |
| `compiler/compiler.js` | interface du compilateur : dossier d’exercices, liste, aperçu, compilation, téléchargement ; lit en ligne les fichiers du projet (§ 11.1) |
| `compiler/lancer-local.ps1` | serveur local et compilateur, pour essayer une modification du moteur avant de la publier |

## 7. Exercices PyWims existants

L’export des exercices de la base Django PyWims vers des fichiers `.pwq` est
un sous-projet distinct, traité plus tard.

## 8. Tests

- `tests/compiler-tests.html` : analyseur `.pwq`, balises, widgets, correction
  par défaut, assemblage des feuilles ; quelques secondes.
- `tests/runtime-tests.html` : cycle de vie des questions, progression, mémoire,
  délais, avec un Python simulé ; quelques secondes.
- `tests/python-tests.html` : vrai Pyodide (module `pywims`, isolement des
  questions, calcul sans fin, chaque exercice du dossier compilé puis corrigé,
  seul et dans une activité) et balayage des tirages.
- `tests/outils/essai_compilateur.py` : l’interface du compilateur, de bout en
  bout (ouverture d’un dossier d’exercices, liste, « Tout sélectionner »,
  aperçu réel, compilation, fichier téléchargé, dossier mémorisé, « Relire »,
  « Rouvrir », et le chemin de Firefox et Safari imité sans
  `showDirectoryPicker`), sans erreur JavaScript. Le
  dossier ouvert est une copie des seuls exercices de la racine d’`exercises/` :
  comme les autres tests, il ne dépend pas du contenu des sous-dossiers.
- `tests/outils/lancer-tests.ps1` lance le tout dans Edge sans interface.
- Le pilotage d’Edge passe par Playwright pour Python (`pip install
  playwright`), avec l’Edge installé (`channel="msedge"`) : aucun autre
  navigateur à télécharger. Il ouvre les pages, donne le dossier au sélecteur,
  reçoit les téléchargements et fait les captures.
- `tests/outils/capture.py` : capture d’une page sur ordinateur ou sur
  téléphone (375 px de large, écran tactile), pour vérifier le rendu (§ 9).
- Un test vérifie un comportement, et non la présence d’une chaîne dans le
  code.
- **Un seul analyseur `.pwq`**, celui du compilateur. Le balayage des tirages
  (chaque tirage exécuté, ses solutions converties, saisies comme par un élève
  et jugées justes) passe par lui et par le vrai Pyodide, dans
  `tests/python-tests.html` : 20 tirages par exercice par défaut,
  `?tirages=200` pour un balayage complet, plus lent (quelques minutes). Un
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
- Le rendu se vérifie sur ordinateur et sur téléphone (375 px de large,
  `tests/outils/capture.py`).

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
  recalcule et les compare comme le `context` (§ 5.1), quand la question a
  un `apres`.
- Deux tirages qui ne diffèrent que par l’ordre des choix restent distincts :
  « Nouvel énoncé » mélange alors les choix d’une question sans aléatoire.

### 10.3 Correction

- `apres` reçoit sous le nom du champ l’indice choisi (`input_radio`) ou la
  liste croissante des indices cochés (`input_checkbox`, `[]` si rien n’est
  coché), dans l’ordre de l’auteur : le mélange est invisible pour lui.
- `apres` décide de la réussite par `ok_answer['nom']`, comme pour les autres
  champs. Un choix multiple est juste en tout ou rien.
- `apres` est facultatif (§ 2.6) : sans lui, la saisie est comparée à la
  solution, sans Python. On ne l’écrit que pour des retours ciblés.
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
  l’entraînement, pas une évaluation. Sa place est réservée dès l’affichage
  (son apparition ne déplace rien), mais au plus juste : elle empiète sur la
  marge qui suit le groupe de choix, sans toucher au dernier choix.

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

## 11. Site du projet : compilateur hébergé, accueil, mode d’emploi

Le projet est publié en ligne : une page d’accueil qui le présente et le montre,
le compilateur, où l’on ne choisit plus que son dossier d’exercices, et un mode
d’emploi pour créer un exercice, avec ou sans IA. La cohérence (§ 3) et la
liste par titre (§ 11.3) sont déjà en place dans le compilateur local.

### 11.1 Publication

- Le site est publié par GitHub Pages depuis la branche `master` du dépôt
  public, à l’adresse `https://esandier.github.io/PyWimsOnHTML/` : accueil
  (`index.html` à la racine), compilateur (`compiler/`), mode d’emploi
  (`guide/`). C’est gratuit pour un dépôt public ; l’activation se fait une
  fois dans les réglages du dépôt.
- Chaque push sur `master` met à jour le site.
- Les fichiers du projet utiles à l’assemblage (`layouts/`, `runtime/`,
  `widgets/`, `css/`) sont lus par le compilateur à côté de lui (même origine),
  et non plus dans un dossier choisi par l’utilisateur. Ils sont relus à chaque
  compilation, sans cache périmé (revalidation auprès du serveur) : une
  compilation n’utilise jamais deux versions mêlées du projet.
- Le module `pywims` et le script du Worker sont lus en ligne avec les autres
  fichiers, puis intégrés au fichier généré : tirages calculés et rejoués
  utilisent le même code (§ 3).
- Python (Pyodide, SymPy et le module `pywims`) se charge dès l’ouverture du
  compilateur, en arrière-plan : le premier aperçu et la première compilation
  n’attendent plus son chargement (de 10 s à beaucoup plus, selon le navigateur
  et la connexion). Un échec de ce préchargement est silencieux : la
  compilation recommence le chargement, et en donne l’erreur.
- **Développement local** : `compiler/lancer-local.ps1` démarre un serveur
  local à la racine du projet et ouvre le compilateur dans le navigateur ; on
  essaie ainsi une modification du moteur avant de la publier. Ouvert
  directement depuis le disque (`file://`), le compilateur ne peut pas lire
  ses fichiers : il le dit, et indique ce script.
- Les exercices ne sont jamais envoyés : la page les lit sur l’ordinateur.
- L’extension reste `.pwq` : le format est celui de PyWims, que ce projet
  ressuscite.

### 11.2 Dossier des exercices

- Un seul dossier d’exercices à la fois, n’importe où sur le disque. Les
  fichiers `.pwq` de ses sous-dossiers sont lus aussi.
- **Chrome et Edge** : le dossier est choisi une fois et mémorisé (accès
  conservé par le navigateur, dans IndexedDB). À la visite suivante, un bouton
  « Rouvrir « nom du dossier » » suffit : le navigateur demande seulement de
  confirmer l’accès. Un bouton « Relire » prend en compte les fichiers modifiés,
  ajoutés ou supprimés, sans choisir de nouveau le dossier ; la compilation
  relit elle aussi les fichiers, et un fichier modifié depuis l’ouverture ne
  pose plus de problème.
- **Firefox et Safari** : ces navigateurs ne permettent pas à une page de
  rouvrir un dossier d’une visite à l’autre. Le dossier se choisit à chaque
  visite ; le nom du dernier dossier est rappelé pour aider à le retrouver.
  Pour prendre en compte un fichier modifié, on choisit de nouveau le dossier
  (le message du § 11.3 le rappelle).
- La page détecte ce que le navigateur permet ; aucun message d’erreur ne
  signale l’absence de mémorisation.

### 11.3 Liste des exercices

- Chaque exercice est désigné par son **titre**. Dessous, en petit et en gris,
  les types de champs de réponse qu’il utilise, dans l’ordre de l’énoncé et
  sans répétition : « texte », « formule », « matrice », « matrice
  redimensionnable », « choix unique », « choix multiple ».
- Les exercices sont regroupés par sous-dossier (le dossier choisi d’abord,
  puis chaque sous-dossier sous son nom), et triés par titre dans l’ordre
  naturel (« (2) » avant « (10) ») dans chaque groupe.
- Un fichier illisible est listé sous son nom de fichier, avec la mention
  « fichier illisible » ; son erreur s’affiche quand on le choisit.
- La recherche porte sur le titre, les mots-clés et le chemin.
- Un bouton « Tout sélectionner » coche les exercices visibles, c’est-à-dire
  ceux que la recherche laisse affichés ; quand ils sont tous cochés, il devient
  « Tout désélectionner » et les décoche. Les exercices masqués par la
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
  `css/chartes/upec.css`.
- **Charte du dossier** : si le dossier d’exercices contient un fichier
  `brand.css` à sa racine, il remplace la charte par défaut, pour l’aperçu
  comme pour les fichiers générés. Un enseignant y met la charte de son
  établissement, une fois pour toutes.
- Le compilateur indique la charte utilisée (« Charte : brand.css du dossier »
  ou « Charte neutre »).

### 11.5 Mode d’emploi : créer un exercice

Une page `guide/`, liée depuis l’accueil et le compilateur, en deux chemins :

- **Avec une IA** : un bouton « Copier le prompt » copie le texte de
  `PROMPT.md`. On le colle dans son assistant, on décrit l’exercice voulu (ou
  on donne une question AMC à convertir), on enregistre la réponse dans un
  fichier `.pwq` du dossier d’exercices, puis on l’ouvre dans le compilateur.
- **Sans IA** : l’essentiel du format en une page (les champs, `{{variable}}`,
  les balises de saisie, la correction avec ou sans `apres`), et deux modèles
  commentés à télécharger et modifier : un QCM sans Python
  (`guide/modeles/qcm.pwq`) et une question à réponse calculée
  (`guide/modeles/calcul.pwq`). `PROMPT.md` reste la référence complète,
  lisible aussi par un humain ; le guide y renvoie au lieu de la recopier.
- **Publier** : compiler, puis déposer le fichier HTML sur Moodle comme
  ressource « Fichier » (ou l’envoyer aux élèves) ; rappel que le fichier sert
  à l’entraînement (§ 1).
- Les modèles sont des exercices vérifiés par les tests, comme ceux de la
  racine d’`exercises/`.

### 11.6 Page d’accueil

- `index.html` à la racine : ce que fait PyWimsOnHTML en quelques lignes
  (exercices aléatoires corrigés dans le navigateur, un seul fichier HTML, sans
  serveur ni compte, pour l’entraînement, sur ordinateur et téléphone), des
  démonstrations à essayer, et deux liens : « Créer un exercice » (guide) et
  « Compiler » (compilateur).
- **Démonstrations** : des feuilles compilées à partir des exercices de la
  racine d’`exercises/`, avec la charte neutre, enregistrées dans `demos/`. Un
  script (`tests/outils/demos.py`) les recompile par le vrai compilateur ; on
  le lance avant de publier une modification du moteur.
- Charte neutre, page sobre, lisible sur téléphone.

### 11.7 Étapes

1. **Fichiers du projet lus en ligne** : plus de choix du dossier du projet ;
   `compiler/lancer-local.ps1` ; README mis à jour. Activation de GitHub Pages
   (par l’auteur).
2. **Dossier mémorisé** sur Chrome et Edge, nom rappelé sur Firefox et Safari,
   bouton « Relire ».
3. **Charte** : charte neutre par défaut, UPEC en exemple, charte du dossier.
4. **Liste regroupée par sous-dossier.**
5. **Mode d’emploi et modèles**, puis **page d’accueil et démonstrations**,
   publiés ensemble.

## 12. Points ouverts

- **Banque de questions** (comme `\element` et `\restituegroupe` d’AMC) : une
  question de l’activité serait un groupe de fichiers `.pwq`, chaque tirage
  appartenant à l’un d’eux. Chantier ultérieur.
- **Graphiques matplotlib** dans les énoncés, produits en SVG à la
  compilation. Chantier ultérieur.
- **Glisser-déposer** (balises PyWims `input_drag` / `input_drop`). Chantier
  ultérieur.
- **Figures interactives** avec GeoGebra et/ou JSXGraph. Chantier ultérieur.
- **Outils SymPy pour `apres`** (comparer une expression saisie en une ligne),
  et une seule façon de lire les saisies : `py_wims` passe par `sympify`, sans
  le filtre de `math_expression`, et n’évalue pas la saisie.
- **Tests hors du navigateur** (Node.js) et intégration continue sur GitHub,
  avant la diffusion large.
- **Clavier choisi par l’auteur** pour une case ou un champ (pavé numérique
  quand toutes les réponses sont des nombres positifs).
- **Autres écritures des nombres** (notation scientifique pour la physique).
- **Ordre des questions d’une activité**, choisi dans le compilateur ; il suit
  aujourd’hui l’ordre des titres.
- **KaTeX à la place de MathJax** : plus léger et plus rapide ; à étudier
  (couverture de l’écriture des exercices, par exemple `@{\;}` dans un
  `array`, rendu, MathLive). Mesure d’octobre 2026 : MathJax pèse 603 Ko, et
  compose les 21 questions d’une activité en 2,5 s sur un processeur ralenti
  4 fois.
- **`py_wims` sur l’analyseur de `math_expression`** (filtre et `parse_expr`) :
  son comportement changerait, car il n’évalue pas la saisie aujourd’hui.
