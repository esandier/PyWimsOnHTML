# Prompt pour la prochaine session

À coller au début de la prochaine session.

```text
Projet PyWimsOnHTML (C:\Users\esandier\OneDrive - UPEC\Etienne\Python\PyWimsOnHTML).
Il compile des exercices PyWims en fichiers HTML autonomes (Pyodide, SymPy, MathJax en SVG,
MathLive). Les élèves les utilisent surtout sur téléphone.

Sources de vérité, à lire avant toute proposition : SPECIFICATION.md (référence),
README.md, PROMPT.md (format des exercices). Les 7 étapes de la spécification sont terminées.
Rappels d'architecture :
- un fichier = une feuille de questions dans un seul document, sans iframe ;
- le compilateur calcule 20 tirages par question (graines 0 à 19) et les intègre en JSON ;
- le navigateur affiche un tirage tout de suite, puis le rejoue avec Python et vérifie que
  le « context » obtenu est identique au stocké ;
- runtime/template.js porte la grammaire des balises, runtime/python.js le module pywims,
  runtime/runner.js la classe Question ;
- tests : tests/outils/lancer-tests.ps1 (Edge sans interface ; option -SansPyodide).

Façon de travailler :
- tout clarifier avec moi avant de coder, et attendre mon « go » explicite ;
- avancer par petites étapes testables ;
- commenter le code en français, en expliquant le pourquoi des choix non évidents ;
- interface, commentaires et exercices en français.

Travail de cette session, en trois chantiers. Pour chacun : analyse le code concerné,
propose une conception, pose-moi les questions ouvertes, puis attends mon accord.

1) Renommer l'extension .pwe en .pwq (« pywims question »).
   Tout ce qui en dépend : fichiers de exercises/, filtre du compilateur, tests,
   README, PROMPT, SPECIFICATION, messages d'erreur. Faut-il accepter encore .pwe un
   temps ? Pense aussi au futur export de la base Django PyWims.

2) Questions à choix unique ou multiple, où l'on puisse coller une question AMC
   (auto-multiple-choice, LaTeX : question / questionmult, \bonne, \mauvaise…).
   À clarifier :
   - nouvelle balise dans l'énoncé ou autre mécanisme ;
   - sous-ensemble de LaTeX AMC accepté et conversion en HTML et MathJax ;
   - mélange des réponses par la graine du tirage ;
   - lien avec solution= et avec « apres » (correction automatique ou écrite par
     l'auteur) ;
   - règle pour le choix multiple (tout ou rien ?) ;
   - comportement de Vérifier, Corriger et Solution (couleurs, rien ne bouge) ;
   - affichage sur téléphone.

3) Graphiques matplotlib dans les énoncés.
   Point clé : les tirages sont précalculés à la compilation, donc la figure peut être
   produite à ce moment-là, en SVG intégré au tirage, sans charger matplotlib chez
   l'élève. Mais aujourd'hui le navigateur rejoue « avant » et compare tout le
   context : il faut décider comment traiter la figure (exclue de la comparaison ?
   imports de matplotlib ignorés au chargement des paquets ?).
   À clarifier aussi :
   - syntaxe dans l'énoncé ;
   - taille du fichier (20 tirages × SVG) ;
   - lisibilité sur téléphone ;
   - accessibilité (texte alternatif).
```
