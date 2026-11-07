// Choix unique (SPECIFICATION.md, § 10) : un groupe de boutons radio, dans l’ordre mélangé du tirage ;
// dessin et comportement partagés avec les autres champs à choix (widgets/lib/choices.js).
PyWimsWidgets.define("input_radio", {
  ...PyWimsWidgets.choiceBehaviour({ multiple: false }),
  render: ({ name, attributes }, { draw, idPrefix }) => PyWimsWidgets.inputChoice(name, {
    multiple: false, texts: draw.choices?.[name], order: draw.orders?.[name], columns: attributes.columns, idPrefix
  })
});
