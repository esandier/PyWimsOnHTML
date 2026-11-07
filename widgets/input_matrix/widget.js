// Matrice de taille fixe (SPECIFICATION.md, § 2.3) : dessin et comportement partagés avec la matrice
// redimensionnable (widgets/lib/matrix.js).
PyWimsWidgets.define("input_matrix", {
  ...PyWimsWidgets.matrixBehaviour,
  // Les cases données (given) viennent de la solution du tirage.
  render: ({ name, attributes }, { draw, idPrefix }) => PyWimsWidgets.inputMatrix(name, attributes.rows, attributes.cols,
    { inputStyle: attributes.input_style || "", idPrefix, given: draw.solutions[name] })
});
