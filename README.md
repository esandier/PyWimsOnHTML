# PyWimsOnHTML

PyWimsOnHTML compile des questions PyWims (fichiers `.pwq`) en fichiers HTML
interactifs et autonomes. Le compilateur est une page web statique ; le fichier
généré fonctionne sans serveur et charge Pyodide, SymPy, MathJax et, si besoin,
MathLive depuis Internet. Il est conçu pour l’ordinateur comme pour le
téléphone.

Le site du projet, <https://esandier.github.io/PyWimsOnHTML/>, présente l’outil
avec des démonstrations, donne un mode d’emploi pour créer une question (avec ou
sans IA, avec des modèles) et héberge le compilateur.

La conception d’ensemble est décrite dans [`SPECIFICATION.md`](SPECIFICATION.md),
qui fait référence ; le format des questions est détaillé dans
[`PROMPT.md`](PROMPT.md).

## Structure du projet

- `compiler/` — page du compilateur (`index.html`), son interface (`compiler.js`) et ses modules :
  format `.pwq` (`format.js`), tirages et contrôles (`draws.js`), assemblage (`assemble.js`),
  archive ZIP (`zip.js`)
- `exercises/` — fichiers de questions `.pwq`
- `layouts/` — mise en page HTML commune aux questions seules et aux activités
- `widgets/` — champs de saisie : texte, MathLive, matrices fixes et redimensionnables, choix
  unique ou multiple
- `css/` — charte neutre par défaut (`brand.css`), exemples de chartes (`chartes/`, dont
  celle de l’UPEC) et styles des questions (`exercise.css`)
- `runtime/` — code intégré au fichier généré : grammaire des balises
  (`template.js`), correction sans Python (`correction.js`), Python dans un
  Worker (`python.js`, `python-worker.js`) et module `pywims` (`pywims.py`),
  champs (`fields.js`), cycle de vie d’une question (`question.js`) et feuille
  (`sheet.js`)
- `tests/` — pages de tests et outils pour les lancer

## Utiliser le compilateur

Ouvre le compilateur en ligne, <https://esandier.github.io/PyWimsOnHTML/compiler/>,
dans un navigateur récent, puis clique sur **Ouvrir un dossier de questions** et
choisis le dossier où sont tes fichiers `.pwq` (ceux de ses sous-dossiers sont
lus aussi). Le bouton devient **Dossier ouvert :** suivi du nom du dossier ; il
permet d’en ouvrir un autre. Les questions restent sur l’ordinateur : rien n’est
téléversé. Sur Chrome et Edge, le dossier est mémorisé : à la visite suivante,
**Rouvrir « nom »** suffit, et **Relire** prend en compte les fichiers modifiés,
ajoutés ou supprimés ; la compilation relit d’elle-même les questions choisies.
Sur Firefox et Safari, on choisit le dossier à chaque visite.

Pour essayer une modification du moteur (`runtime/`, `widgets/`, `css/`,
`layouts/`) avant de la publier, lance `compiler/lancer-local.ps1` : il démarre
un serveur local à la racine du projet et ouvre le compilateur. Ouvert
directement depuis le disque (`file://`), le compilateur ne peut pas lire ses
fichiers, et il le dit.

À gauche, la liste des questions se filtre par nom ou par mot-clé. Un clic sur
une question en affiche l’aperçu à droite, dans une fenêtre qui défile : la vraie
page de la question, aux boutons inactifs. Il apparaît tout de suite, avec chaque
variable de l’énoncé sous son nom, puis il est remplacé par un tirage réel dès
que Python l’a calculé, environ une seconde par question. Python se charge dès
l’ouverture du compilateur, en arrière-plan (10 à 20 secondes) : le premier
aperçu ne l’attend que s’il est demandé tout de suite. Une erreur dans `avant` est
signalée au-dessus de l’aperçu, qui reste provisoire.

Coche une ou plusieurs questions, puis **Compiler la sélection** :

- une question : un fichier HTML ;
- plusieurs questions : soit une **activité**, un seul fichier HTML qui les
  réunit sous un titre à indiquer, dans l’ordre où elles ont été cochées (les
  flèches « ↑ » et « ↓ » de la liste « Ordre des questions » le changent), soit
  des **pages séparées**, une question par fichier, réunies dans une archive ZIP.

La compilation calcule 20 tirages par question (graines 0 à 19), ou le nombre
du champ `tirages`, et les intègre
au fichier ; les tirages identiques sont fusionnés. Elle s’arrête au premier
problème, avec la graine en cause : erreur dans `avant`, variable de l’énoncé
non définie, solution absente ou de mauvaises dimensions, etc. Une exécution
de `avant` ou de `apres` qui dépasse 30 s (boucle sans fin) arrête la
compilation avec un message, sans bloquer le compilateur.

Les fichiers du projet (mise en page, moteur, module `runtime/pywims.py`) sont
lus en ligne, à côté du compilateur, au début de chaque compilation : les
tirages sont calculés avec le module qui est intégré au fichier généré, et les
deux restent toujours d’accord. On peut ajouter ses propres outils Python à
`pywims.py` (en local, avec `lancer-local.ps1`) ; chaque nom exporté (`__all__`)
doit aussi être réservé dans `runtime/template.js`, ce que vérifient les tests.

## Le fichier généré

- **Affichage immédiat.** Un tirage précalculé est affiché dès l’ouverture.
- **Python seulement si besoin.** Une question sans `apres` se corrige dans le
  navigateur, sans Python, par comparaison avec sa solution : c’est le cas
  courant des QCM, et une feuille qui n’a que de telles questions ne charge
  jamais Pyodide. Pour une question qui a un `apres`, Python se charge en
  arrière-plan au premier contact de l’élève avec elle (toucher, clic ou focus),
  puis rejoue le tirage pour vérifier qu’il retrouve les mêmes valeurs : un
  élève qui ne fait que lire la feuille ne télécharge pas Pyodide.
- **Calcul trop long.** Python tourne à part (Web Worker) : la page ne gèle pas
  pendant ses calculs. Une correction qui dépasse 15 s, par exemple pour une
  saisie démesurée, est arrêtée ; l’élève est invité à modifier sa réponse, et
  Python repart de lui-même.
- **Cycle de vie d’une question.** **Vérifier ma réponse** colore les champs
  (vert ou rouge) et affiche le retour ; **Corriger ma réponse** rouvre les
  champs faux ; **Solution** remplit tous les champs avec la solution et affiche
  l’explication éventuelle ; **Nouvel énoncé** passe à un autre tirage sans
  recharger la page. Les boutons gardent leur place : rien ne bouge quand on
  clique.
- **Activité.** Un seul document : Pyodide, MathJax et MathLive ne sont chargés
  qu’une fois, et chaque question qui a un `apres` a sa propre session Python. L’en-tête affiche
  le pourcentage de questions réussies (une vérification entièrement juste ; une
  solution affichée ne compte pas) et une barre de progression ; le numéro d’une
  question réussie devient ✓, et des confettis saluent les 100 %.
- **Mémoire de la progression.** Une activité garde, sur l’appareil de l’élève,
  les questions réussies : en rouvrant la feuille (depuis Moodle ou un site), il
  retrouve leur ✓ et son pourcentage ; les autres questions repartent vierges.
  Rien n’est envoyé à personne. Le bouton ↺ de l’en-tête (« Réinitialiser la
  feuille ») efface cette mémoire, après confirmation. Une feuille modifiée puis republiée repart de zéro : il vaut
  mieux ne pas modifier une feuille pendant que les élèves la travaillent.
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
  retour passe sous l’énoncé et la carte s’agrandit en douceur. Les champs
  texte et les cases de matrice reçoivent la saisie telle quelle (pas de
  majuscule ni de correction automatiques), avec le clavier complet.

La vérification se fait dans le navigateur : elle sert à l’entraînement, pas à
une évaluation sécurisée. Les champs de la question et ses tirages sont intégrés
au HTML comme blocs de texte lisibles et échappés (sans `avant` pour une
question sans `apres`, qui ne charge pas Python).

Les couleurs, polices et couleurs de correction sont les variables CSS d’une
charte : par défaut la charte neutre, `css/brand.css`. Pour celle de son
établissement, on place un fichier `brand.css` à la racine de son dossier
de questions (exemple complet, avec logo : `css/chartes/upec.css`) ; le
compilateur l’utilise et l’indique. Les bibliothèques en ligne sont figées sur une
version exacte : Pyodide 0.27.7, MathJax 3.2.2 (rendu SVG), MathLive 0.111.0.
MathJax reconnaît `$...$`, `$$...$$`, `\(...\)` et `\[...\]`.

## Format des questions

Un fichier `.pwq` contient les champs `title`, `keywords`, `layout` (`STD`),
`avant` (tirage et calcul des solutions), `enonce` (modèle de l’énoncé, avec
`{{variable}}` et des balises de saisie) et, facultativement, `apres`
(correction) et `tirages` (nombre de tirages calculés, de 1 à 200 ; 20 par
défaut). Chaque balise de saisie désigne sa solution
(`solution=variable`). La question importe elle-même ses bibliothèques, ainsi que
les outils du module `pywims` (`py_wims`, `is_nombre`, `math_expression`,
`decimal_fr`, `LIBRE`). `apres` peut définir la variable `feedback`, et `avant`
la variable `explication_solution`.

**Sans `apres`, l’élève doit donner ce qu’affiche le bouton « Solution ».**
Seuls les espaces, le signe moins typographique et le codage des accents sont
ignorés ; les majuscules, l’ordre des termes et le séparateur décimal comptent.
On écrit donc `apres` quand plusieurs écritures sont justes, pour un retour
ciblé selon l’erreur, et toujours pour un champ MathLive (`input_math`), qui se
corrige par une comparaison symbolique. Pour une réponse décimale écrite avec
une virgule, `decimal_fr(x, 2)` donne la solution (`"1,41"`).

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
  converti depuis AMC, avec « Aucun de ces nombres », un barème et des retours
  ciblés (`apres`) ;
- [`Decim3.pwq`](exercises/Decim3.pwq) — choix unique sans `apres`, corrigé
  sans Python, avec un barème et une explication de la solution.

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
  questions, chaque question du dossier `exercises/` compilée puis corrigée, seule
  et dans une activité), et balayage des tirages de chaque question : chaque
  tirage est exécuté deux fois, ses solutions converties, saisies comme par un
  élève et jugées justes. 20 tirages par question par défaut, quelques minutes ;
  `?tirages=200` pour un balayage complet, plus long.

Sous Windows, `tests/outils/lancer-tests.ps1` lance tout automatiquement (Edge
sans interface, profil vierge), puis `tests/outils/essai_compilateur.py`, qui
essaie l’interface du compilateur de bout en bout : ouverture du dossier, liste,
aperçu, compilation et fichier téléchargé. Prérequis : Python avec le paquet
`playwright` (`pip install playwright`), qui pilote l’Edge installé, sans autre
navigateur à télécharger. L’option `-SansPyodide` saute les tests du vrai Pyodide, les
plus longs ; `-Tirages 200` demande un balayage complet.

Pour vérifier un rendu, `python tests/outils/capture.py URL image.png --telephone`
capture une page comme sur un téléphone (375 px de large) ; sans `--telephone`,
comme sur un ordinateur.

Les tests servent les pages par `http://`, alors qu’un élève ouvre souvent le
fichier depuis le disque (`file://`), où le navigateur se comporte parfois
autrement : une vérification manuelle dans ce cas reste utile.

## Licence

© 2026 Etienne Sandier. PyWimsOnHTML est un logiciel libre distribué sous la
licence [CeCILL 2.1](LICENCE), régie par le droit français et compatible avec la
GNU GPL. Les bibliothèques chargées en ligne (Pyodide, SymPy, MathJax,
MathLive) gardent leurs propres licences.
