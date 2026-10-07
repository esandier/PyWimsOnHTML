# PyWimsOnHTML

PyWimsOnHTML compile des exercices PyWims (fichiers `.pwq`) en fichiers HTML
interactifs et autonomes. Le compilateur est une page web statique ; le fichier
généré fonctionne sans serveur et charge Pyodide, SymPy, MathJax et, si besoin,
MathLive depuis Internet. Les élèves l’utilisent souvent sur téléphone.

La conception d’ensemble est décrite dans [`SPECIFICATION.md`](SPECIFICATION.md),
qui fait référence ; le format des exercices est détaillé dans
[`PROMPT.md`](PROMPT.md).

## Structure du projet

- `compiler/` — interface du compilateur (`index.html`) et compilateur (`compiler.js`)
- `exercises/` — fichiers d’exercice `.pwq`
- `layouts/` — mise en page HTML commune aux questions seules et aux activités
- `widgets/` — champs de saisie : texte, MathLive, matrices fixes et redimensionnables, choix
  unique ou multiple
- `css/` — charte de l’organisation (`brand.css`) et styles des exercices (`exercise.css`)
- `runtime/` — code intégré au fichier généré : grammaire des balises
  (`template.js`), Python et module `pywims` (`python.js`), cycle de vie des
  questions (`runner.js`)
- `tests/` — pages de tests et outils pour les lancer
- `maquettes/` — maquette de la mise en page, validée avant le développement

## Utiliser le compilateur

Ouvre `compiler/index.html` dans un navigateur récent, puis clique sur
**Ouvrir un dossier** et choisis le dossier du projet PyWimsOnHTML. Le bouton
devient **Dossier ouvert :** suivi du nom du dossier ; il permet d’en ouvrir un
autre. Les fichiers restent sur l’ordinateur : rien n’est téléversé.

À gauche, la liste des exercices se filtre par nom ou par mot-clé. Un clic sur
un exercice en affiche l’aperçu à droite, dans une fenêtre qui défile : la vraie
page de l’exercice, aux boutons inactifs. Il apparaît tout de suite, avec chaque
variable de l’énoncé sous son nom, puis il est remplacé par un tirage réel dès
que Python l’a calculé : 10 à 20 secondes la première fois, le temps de charger
Python, puis environ une seconde par exercice. Une erreur dans `avant` est
signalée au-dessus de l’aperçu, qui reste provisoire.

Coche une ou plusieurs questions, puis **Compiler** :

- une question : un fichier HTML ;
- plusieurs questions : soit une **activité**, un seul fichier HTML qui les
  réunit sous un titre à indiquer, soit des **pages séparées**, une question
  par fichier, réunies dans une archive ZIP.

La compilation calcule 20 tirages par question (graines 0 à 19) et les intègre
au fichier ; les tirages identiques sont fusionnés. Elle s’arrête au premier
problème, avec la graine en cause : erreur dans `avant`, variable de l’énoncé
non définie, solution absente ou de mauvaises dimensions, etc.

Si la page du compilateur a gardé en cache une ancienne version de
`runtime/python.js`, la compilation est refusée avec un message demandant de la
recharger (Ctrl+F5) : sinon, les tirages calculés ne correspondraient plus à
ceux que rejoue le fichier généré.

## Le fichier généré

- **Affichage immédiat.** Un tirage précalculé est affiché dès l’ouverture.
  Python se charge en arrière-plan et rejoue ce tirage pour vérifier qu’il
  retrouve les mêmes valeurs.
- **Cycle de vie d’une question.** **Vérifier ma réponse** colore les champs
  (vert ou rouge) et affiche le retour ; **Corriger ma réponse** rouvre les
  champs faux ; **Solution** remplit tous les champs avec la solution et affiche
  l’explication éventuelle ; **Nouvel énoncé** passe à un autre tirage sans
  recharger la page. Les boutons gardent leur place : rien ne bouge quand on
  clique.
- **Activité.** Un seul document : Pyodide, MathJax et MathLive ne sont chargés
  qu’une fois, et chaque question a sa propre session Python. L’en-tête affiche
  le pourcentage de questions réussies (une vérification entièrement juste ; une
  solution affichée ne compte pas) et une barre de progression ; le numéro d’une
  question réussie devient ✓, et des confettis saluent les 100 %.
- **Questions à choix.** Les choix sont mélangés à chaque tirage. La
  vérification colore seulement les choix cochés (vert ou rouge, avec ✓ ou ✗) ;
  sur téléphone, les colonnes se réduisent tant qu’un choix ne tient pas.
- **Note indicative.** Une question à choix qui a un barème (syntaxe d’AMC)
  affiche, à chaque vérification, la note que la réponse obtiendrait, en bas à
  droite de sa carte. Une activité additionne ces notes dans sa barre de titre ;
  un nouvel énoncé remet la note de sa question à 0. C’est un repère pour
  l’entraînement : le pourcentage, lui, ne compte que les réussites complètes.
- **Aide de l’élève.** Le bouton **?** de l’en-tête explique les quatre boutons
  et, dans une activité, le sens du pourcentage et de la note ; une bulle
  rappelle le sens du pourcentage au survol ou au toucher.
- **Téléphone.** Les boutons n’affichent que leur icône ; dans une activité, le
  retour passe sous l’énoncé et la carte s’agrandit en douceur.

La vérification se fait dans le navigateur : elle sert à l’entraînement, pas à
une évaluation sécurisée. Les champs de l’exercice et ses tirages sont intégrés
au HTML comme blocs de texte lisibles et échappés.

Les couleurs, polices et couleurs de correction de l’organisation sont des
variables CSS de `css/brand.css`. Les bibliothèques en ligne sont figées sur une
version exacte : Pyodide 0.27.7, MathJax 3.2.2 (rendu SVG), MathLive 0.111.0.
MathJax reconnaît `$...$`, `$$...$$`, `\(...\)` et `\[...\]`.

## Format des exercices

Un fichier `.pwq` contient six champs, tous obligatoires : `title`, `keywords`,
`layout` (`STD`), `avant` (tirage et calcul des solutions), `enonce` (modèle de
l’énoncé, avec `{{variable}}` et des balises de saisie) et `apres` (correction).
Chaque balise de saisie désigne sa solution (`solution=variable`). L’exercice
importe lui-même ses bibliothèques, ainsi que les outils du module `pywims`
(`py_wims`, `is_nombre`, `math_expression`, `LIBRE`). `apres` peut définir la
variable `feedback`, et `avant` la variable `explication_solution`.

Les questions à choix unique (`input_radio`) ou multiple (`input_checkbox`)
prennent leurs choix dans une liste de `avant` (`choices=`) et leur solution
dans un indice ou une liste d’indices ; un barème facultatif (`bareme=`) suit la
syntaxe d’AMC. Plutôt que d’analyser le LaTeX d’AMC, le projet confie la
conversion d’une question AMC à un LLM : `PROMPT.md` contient la table de
correspondance et un exemple complet.

Le guide complet, avec un exemple, est [`PROMPT.md`](PROMPT.md). Exemples du
dépôt :

- [`pgcd.pwq`](exercises/pgcd.pwq) — champ texte ;
- [`addition-fractions.pwq`](exercises/addition-fractions.pwq) — fraction
  irréductible et dénominateur positif ;
- [`dérivée-polynôme.pwq`](exercises/dérivée-polynôme.pwq) — saisie MathLive et
  correction symbolique ;
- [`matrice-triangulaire.pwq`](exercises/matrice-triangulaire.pwq) — matrice de
  taille fixe, valeurs libres (`LIBRE`) et explication de la solution ;
- [`produit-matrices.pwq`](exercises/produit-matrices.pwq) — matrice
  redimensionnable ;
- [`nombres-premiers.pwq`](exercises/nombres-premiers.pwq) — choix multiple
  converti depuis AMC, avec « Aucun de ces nombres » et un barème.

Les matrices redimensionnables commencent à 2 × 2 ; la poignée ↘ ajoute ou
retire des lignes et des colonnes jusqu’aux limites déclarées, à la souris ou
aux touches fléchées. Seules les cases visibles sont transmises à la correction.

Les autres balises PyWims (menus déroulants `input_select`, glisser-déposer
`input_drag` / `input_drop`…) ne sont pas encore prises en charge : le
compilateur les signale au lieu de les transformer silencieusement.

## Tests

Les pages de tests se servent par un serveur local (par exemple
`python -m http.server` à la racine du projet), car elles lisent les fichiers du
projet :

- `tests/compiler-tests.html` : analyseur, balises, widgets, assemblage des
  feuilles ; quelques secondes ;
- `tests/runtime-tests.html` : cycle de vie des questions, progression et aide,
  avec un Python simulé ; quelques secondes ;
- `tests/python-tests.html` : vrai Pyodide (module `pywims`, isolement des
  questions, chaque exercice du dépôt compilé puis corrigé, seul et dans une
  activité) ; une à deux minutes.

Sous Windows, `tests/outils/lancer-tests.ps1` lance tout automatiquement (Edge
sans interface, profil vierge) et y ajoute `tests/outils/balayage.py`, qui
vérifie 200 tirages de chaque exercice avec le Python local : solution
convertible et jugée juste par `apres`. Prérequis : Python avec les paquets
`websocket-client` et `sympy`. L’option `-SansPyodide` saute les tests du vrai
Pyodide, les plus longs.

Les tests servent les pages par `http://`, alors qu’un élève ouvre souvent le
fichier depuis le disque (`file://`), où le navigateur se comporte parfois
autrement : une vérification manuelle dans ce cas reste utile.

## Licence

© 2026 Etienne Sandier. PyWimsOnHTML est un logiciel libre distribué sous la
licence [CeCILL 2.1](LICENCE), régie par le droit français et compatible avec la
GNU GPL. Les bibliothèques chargées en ligne (Pyodide, SymPy, MathJax,
MathLive) gardent leurs propres licences.
