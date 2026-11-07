// Champ texte (SPECIFICATION.md, § 2.3) : le comportement par défaut des widgets, comparé à
// l’écriture de la solution selon match ; seul son dessin lui est propre (widgets/lib/text.js).
PyWimsWidgets.define("input_text", {
  render: ({ name, attributes }, { idPrefix }) =>
    PyWimsWidgets.inputText(name, { style: attributes.style || "", idPrefix, inline: attributes.inline ?? false })
});
