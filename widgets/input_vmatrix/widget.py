"""Matrice redimensionnable : l'élève choisit la taille, dans les limites max_rows × max_cols (10 par
défaut) ; la solution doit y tenir."""
from pywims import _solution_cells


def prepare(attributes):
    max_rows = attributes.get("max_rows", 10)
    max_cols = attributes.get("max_cols", 10)
    cells = _solution_cells(attributes["solution"])
    columns = len(cells[0]) if cells else 0
    if (any(len(row) != columns for row in cells) or not 1 <= len(cells) <= max_rows
            or not 1 <= columns <= max_cols):
        raise TypeError("la solution est une matrice {} × {}, hors des limites {} × {} du champ.".format(
            len(cells), columns, max_rows, max_cols))
    return {"solution": cells}
