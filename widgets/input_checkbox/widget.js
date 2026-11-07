// Choix multiple (SPECIFICATION.md, § 10) : un groupe de cases à cocher ; ne rien cocher est une réponse.
// Dessin et comportement partagés avec les autres champs à choix (widgets/lib/choices.js).
PyWimsWidgets.define("input_checkbox", {
  ...PyWimsWidgets.choiceBehaviour({ multiple: true }),
  render: ({ name, attributes }, { draw, idPrefix }) => PyWimsWidgets.inputChoice(name, {
    multiple: true, texts: draw.choices?.[name], order: draw.orders?.[name], columns: attributes.columns, idPrefix
  })
});
