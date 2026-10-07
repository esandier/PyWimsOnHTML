# Prompt pour la prochaine session

À coller au début de la prochaine session.

```text
Projet PyWimsOnHTML (C:\Users\esandier\OneDrive - UPEC\Etienne\Python\PyWimsOnHTML).
Il compile des exercices PyWims (fichiers .pwq, « PyWims question ») en fichiers HTML
autonomes (Pyodide, SymPy, MathJax en SVG, MathLive). Les élèves les utilisent surtout
sur téléphone.

Sources de vérité, à lire avant toute proposition : SPECIFICATION.md (référence),
README.md, PROMPT.md (format des exercices et conversion depuis AMC).
Rappels d'architecture :
- un fichier = une feuille de questions dans un seul document, sans iframe ;
- le compilateur calcule 20 tirages par question (graines 0 à 19) et les intègre en JSON ;
- le navigateur affiche un tirage tout de suite, puis le rejoue avec Python et vérifie que
  le « context » et les textes des choix obtenus sont identiques aux stockés ;
- runtime/template.js porte la grammaire des balises et le calcul de la note (barème
  AMC), runtime/python.js le module pywims, runtime/runner.js la classe Question ;
- questions à choix (input_radio, input_checkbox) : SPECIFICATION.md § 10 ;
- tests : tests/outils/lancer-tests.ps1 (Edge sans interface ; option -SansPyodide).
  Le terminal de VS Code active parfois l'environnement virtuel du projet « surface »,
  sans websocket-client : lancer les tests avec le Python 3.11 global en tête du PATH.

Façon de travailler :
- tout clarifier avec moi avant de coder, et attendre mon « go » explicite ;
- mettre à jour SPECIFICATION.md avant d'implémenter ;
- avancer par petites étapes testables ;
- commenter le code en français, en expliquant le pourquoi des choix non évidents,
  y compris les solutions écartées (par exemple pour l'affichage sur téléphone) ;
- vérifier le rendu sur téléphone (capture dans un cadre de 375 px : Edge sans
  interface n'affiche pas de fenêtre de moins d'environ 500 px) ;
- interface, commentaires et exercices en français ;
- commits en français, à la fin d'un chantier.

Chantiers restants avant la version 1 (SPECIFICATION.md, § 12) : graphiques matplotlib,
glisser-déposer (input_drag / input_drop), figures interactives GeoGebra et/ou JSXGraph,
banque de questions. Le compilateur hébergé (§ 11) viendra après la version 1.
Le compilateur vérifie déjà la cohérence de chaque tirage (§ 3) : tout nouveau type de
champ doit savoir y saisir sa solution comme un élève.

Travail de cette session : commencer par les deux chantiers ci-dessous (je préciserai
l'ordre). Pour chacun : analyse le code concerné, propose une conception, pose-moi les
questions ouvertes, puis attends mon accord.

1) Graphiques matplotlib dans les énoncés.
   Les tirages sont précalculés à la compilation : la figure peut y être produite en
   SVG, intégrée au tirage, sans charger matplotlib chez l'élève. Piste évoquée lors de
   la session précédente, à rediscuter :
   - un champ facultatif « % figure », exécuté seulement à la compilation, après
     « avant » et dans le même espace de noms : le navigateur ne rejoue que « avant »,
     donc matplotlib n'est ni détecté ni chargé, et la figure reste hors du
     « context » comparé ;
   - balise {% figure variable alt=… %}, texte alternatif obligatoire (texte ou
     variable, car il dépend souvent du tirage) ;
   - style PyWims appliqué avant le tracé (taille, polices, traits, couleurs de
     brand.css), SVG à width: 100% ;
   - taille : mesurer d'abord sur un exemple réel (20 tirages × SVG), puis réduire
     (svg.fonttype='none', métadonnées retirées, coordonnées arrondies, figures
     identiques stockées une fois) ;
   - conteneur exclu de MathJax (deux « $ » dans deux étiquettes du SVG seraient
     appariés).
   Questions ouvertes : champ séparé ou tracé dans « avant » ; syntaxe et largeur ;
   agrandissement au toucher sur téléphone ; nombre de tirages réduit ou non ;
   balayage.py doit-il exécuter le champ figure (matplotlib en local) ?

2) Banque de questions, comme \element et \restituegroupe d'AMC.
   Piste : une question de l'activité serait un groupe de fichiers .pwq, chaque tirage
   appartenant à l'un d'eux ; « Nouvel énoncé » passerait à une autre question de la
   banque, sans changer la progression ni la note. Le travail porte surtout sur le
   compilateur (choisir et nommer les groupes dans l'interface).
```
