"""Matrice de taille fixe : size (carrée), ou rows et cols, de 1 à 10 ; la solution en a la taille."""
from pywims import _solution_cells


def prepare(attributes):
    size = attributes.pop("size", None)
    rectangular = "rows" in attributes or "cols" in attributes
    if (size is not None) == rectangular or (rectangular and not ("rows" in attributes and "cols" in attributes)):
        raise TypeError("input_matrix demande soit size, soit rows et cols.")
    rows = attributes.setdefault("rows", size)
    cols = attributes.setdefault("cols", size)
    if not all(1 <= value <= 10 for value in (rows, cols)):
        raise TypeError("les dimensions ({} × {}) doivent être comprises entre 1 et 10.".format(rows, cols))
    cells = _solution_cells(attributes["solution"])
    if any(len(row) != cols for row in cells) or len(cells) != rows:
        raise TypeError("la solution est une matrice {} × {}, alors que le champ est {} × {}.".format(
            len(cells), len(cells[0]) if cells else 0, rows, cols))
    return {"solution": cells}
