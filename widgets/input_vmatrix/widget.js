// Matrice redimensionnable (SPECIFICATION.md, § 2.3) : l’élève choisit la taille, à la poignée ou au
// clavier ; seules les cases visibles comptent. Une taille différente de celle de la solution rend toutes
// les cases fausses : sans ce contrôle, une case hors de la solution passerait pour une valeur libre.
{
  const { matrixBehaviour } = PyWimsWidgets;
  const viewportOf = (prompt, name) =>
    prompt.querySelector(`.pw-vmatrix-viewport[data-vmatrix-name="${CSS.escape(name)}"]`);

  PyWimsWidgets.define("input_vmatrix", {
    ...matrixBehaviour,
    render: ({ name, attributes }, { idPrefix }) => PyWimsWidgets.inputVMatrix(name, attributes.max_rows ?? 10, attributes.max_cols ?? 10, {
      cellWidth: attributes.cell_width, cellHeight: attributes.cell_height, inputStyle: attributes.input_style || "", idPrefix
    }),
    prepare: prompt => PyWimsWidgets.enableVariableMatrixResize(prompt),
    // Cases visibles seulement.
    inputs: (prompt, field) => matrixBehaviour.inputs(prompt, field).filter(input => {
      const viewport = input.closest(".pw-vmatrix-viewport");
      return Number(input.dataset.matrixRow) < Number(viewport.dataset.visibleRows) &&
        Number(input.dataset.matrixColumn) < Number(viewport.dataset.visibleColumns);
    }),
    verdicts(answer, field, draw) {
      const cells = draw.solutions[field.name];
      if (answer.length !== cells.length || answer[0].length !== cells[0].length) {
        const verdicts = {};
        answer.forEach((row, i) => row.forEach((_, j) => { verdicts[`${field.name}[${i}][${j}]`] = false; }));
        return { verdicts, hints: {} };
      }
      return matrixBehaviour.verdicts(answer, field, draw);
    },
    // La matrice prend d’abord la taille de la solution.
    showSolution(inputs, field, draw, prompt) {
      const cells = draw.solutions[field.name];
      PyWimsWidgets.resizeVariableMatrix(viewportOf(prompt, field.name), cells.length, cells[0].length);
      return PyWimsWidgets.defaults.showSolution.call(this, this.inputs(prompt, field), field, draw);
    }
  });
}
