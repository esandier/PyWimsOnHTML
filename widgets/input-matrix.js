window.PyWimsWidgets = (() => {
  const existing = window.PyWimsWidgets || {};
  const { escapeHtml } = PyWimsTemplate;

  // Construit les champs de saisie communs aux matrices fixes et redimensionnables. Le préfixe
  // distingue les identifiants des questions d’une même feuille (« q2-… »).
  function matrixCells(name, rowCount, columnCount, style, resizable = false, idPrefix = "") {
    idPrefix = PyWimsTemplate.checkIdPrefix(idPrefix);
    return Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => {
        const cellName = `${name} ligne ${row + 1} colonne ${column + 1}`;
        const id = `${idPrefix}form_txt_${name}[${row}][${column}]`;
        const cellClass = resizable
          ? "pw-matrix-cell pw-vmatrix-cell"
          : "pw-input-wrapper pw-matrix-cell";
        return `<span class="${cellClass}"><input class="input pw-input absolute" type="text" inputmode="decimal" autocomplete="off" id="${id}" data-matrix-name="${name}" data-matrix-row="${row}" data-matrix-column="${column}"${resizable ? ` data-vmatrix-name="${name}"` : ""}${style} aria-label="${escapeHtml(cellName)}"><input class="input pw-input phantom" type="text" disabled aria-hidden="true" tabindex="-1"${style}></span>`;
      })
    );
  }

  // Construit une matrice accessible carrée ou rectangulaire de dimensions fixes.
  function inputMatrix(name, rowCount, columnsOrOptions = rowCount, suppliedOptions = {}) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Nom invalide pour input_matrix : ${name}`);
    }
    const columnCount = typeof columnsOrOptions === "number"
      ? columnsOrOptions
      : rowCount;
    const options = typeof columnsOrOptions === "number"
      ? suppliedOptions
      : columnsOrOptions;
    if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 10 ||
        !Number.isInteger(columnCount) || columnCount < 1 || columnCount > 10) {
      throw new Error(`Dimensions invalides pour input_matrix : ${rowCount} × ${columnCount}`);
    }

    const style = options.inputStyle
      ? ` style="${escapeHtml(options.inputStyle)}"`
      : "";
    const rows = matrixCells(name, rowCount, columnCount, style, false, options.idPrefix)
      .map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`)
      .join("");

    return `<span class="pw-matrix-frame"><span class="pw-matrix-delimiter pw-matrix-delimiter-left" aria-hidden="true"></span><table class="pw-matrix" aria-label="Matrice ${rowCount} par ${columnCount}"><tbody>${rows}</tbody></table><span class="pw-matrix-delimiter pw-matrix-delimiter-right" aria-hidden="true"></span></span>`;
  }

  // Affiche une grille redimensionnable tout en préparant le nombre maximal de cases.
  function inputVMatrix(name, maxRows = 10, maxColumns = 10, options = {}) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(`Nom invalide pour input_vmatrix : ${name}`);
    }
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10 ||
        !Number.isInteger(maxColumns) || maxColumns < 1 || maxColumns > 10) {
      throw new Error(`Dimensions maximales invalides pour input_vmatrix : ${maxRows} × ${maxColumns}`);
    }

    // Comme dans une matrice fixe, une case prend la taille de son champ (2em de large par défaut) ;
    // cell_width et cell_height l’imposent explicitement.
    const cellSizes = [
      options.cellWidth ? `--pw-vmatrix-cell-width:${escapeHtml(options.cellWidth)};` : "",
      options.cellHeight ? `--pw-vmatrix-cell-height:${escapeHtml(options.cellHeight)};` : ""
    ].join("");
    const style = ` style="${escapeHtml(options.inputStyle || "width:2em")}"`;
    const cells = matrixCells(name, maxRows, maxColumns, style, true, options.idPrefix).flat(2).join("");
    const initialRows = Math.min(2, maxRows);
    const initialColumns = Math.min(2, maxColumns);
    return `<span class="pw-matrix-frame pw-vmatrix-frame"><span class="pw-matrix-delimiter pw-matrix-delimiter-left" aria-hidden="true"></span><span class="pw-vmatrix-viewport" role="group" aria-label="Matrice redimensionnable ${escapeHtml(name)}" data-vmatrix-name="${escapeHtml(name)}" data-max-rows="${maxRows}" data-max-columns="${maxColumns}" data-visible-columns="${initialColumns}" data-visible-rows="${initialRows}" style="${cellSizes}--pw-vmatrix-columns:${maxColumns};--pw-vmatrix-rows:${maxRows}"><span class="pw-vmatrix-grid">${cells}</span></span><button class="pw-vmatrix-resize" type="button" aria-label="Redimensionner la matrice ${escapeHtml(name)}" data-vmatrix-resizer="${escapeHtml(name)}" title="Glisser pour redimensionner ; utiliser les flèches du clavier">↘</button><span class="pw-matrix-delimiter pw-matrix-delimiter-right" aria-hidden="true"></span></span>`;
  }

  // Fixe exactement le cadre à un nombre entier de cellules.
  function setVMatrixSize(viewport, rows, columns, cell, gap) {
    const maxRows = Number(viewport.dataset.maxRows);
    const maxColumns = Number(viewport.dataset.maxColumns);
    rows = Math.max(1, Math.min(maxRows, rows));
    columns = Math.max(1, Math.min(maxColumns, columns));
    viewport.dataset.visibleColumns = String(columns);
    viewport.dataset.visibleRows = String(rows);
    viewport.style.width = `${columns * cell.width + (columns - 1) * gap}px`;
    viewport.style.height = `${rows * cell.height + (rows - 1) * gap}px`;
  }

  // Fixe la taille visible d’une matrice redimensionnable, par exemple pour afficher la solution.
  function resizeVariableMatrix(viewport, rows, columns) {
    const grid = viewport.querySelector(".pw-vmatrix-grid");
    const cell = viewport.querySelector(".pw-vmatrix-cell").getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    setVMatrixSize(viewport, rows, columns, cell, gap);
  }

  // Rend les matrices redimensionnables case par case, à la souris ou au clavier.
  function enableVariableMatrixResize(root) {
    for (const handle of root.querySelectorAll(".pw-vmatrix-resize")) {
      const viewport = handle.parentElement.querySelector(".pw-vmatrix-viewport");
      const grid = viewport.querySelector(".pw-vmatrix-grid");
      const cellElement = viewport.querySelector(".pw-vmatrix-cell");
      const cell = cellElement.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
      setVMatrixSize(
        viewport,
        Number(viewport.dataset.visibleRows),
        Number(viewport.dataset.visibleColumns),
        cell,
        gap
      );

      handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const startRows = Number(viewport.dataset.visibleRows);
        const startColumns = Number(viewport.dataset.visibleColumns);
        const rowStep = cell.height + gap;
        const columnStep = cell.width + gap;
        const resize = (columns, rows) => {
          setVMatrixSize(viewport, rows, columns, cell, gap);
        };

        handle.onpointermove = moveEvent => {
          if (!handle.hasPointerCapture(moveEvent.pointerId)) {
            return;
          }
          resize(
            startColumns + Math.round((moveEvent.clientX - startX) / columnStep),
            startRows + Math.round((moveEvent.clientY - startY) / rowStep)
          );
        };
        handle.onpointerup = handle.onpointercancel = () => {
          handle.onpointermove = null;
          handle.onpointerup = null;
          handle.onpointercancel = null;
        };
      });

      handle.addEventListener("keydown", event => {
        const columns = Number(viewport.dataset.visibleColumns);
        const rows = Number(viewport.dataset.visibleRows);
        const changes = {
          ArrowRight: [1, 0],
          ArrowLeft: [-1, 0],
          ArrowDown: [0, 1],
          ArrowUp: [0, -1]
        }[event.key];
        if (!changes) {
          return;
        }
        event.preventDefault();
        setVMatrixSize(
          viewport,
          rows + changes[1],
          columns + changes[0],
          cell,
          gap
        );
      });
    }
  }

  return Object.freeze({ ...existing, inputMatrix, inputVMatrix, enableVariableMatrixResize, resizeVariableMatrix });
})();
