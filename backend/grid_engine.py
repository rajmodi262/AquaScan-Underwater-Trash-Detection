"""
AquaScan AI — Grid Engine

Divides a frame into a grid of cells for independent analysis.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt

import config

CvImage = npt.NDArray[np.uint8]


def create_grid(
    image: CvImage,
    rows: int | None = None,
    cols: int | None = None,
) -> list[dict[str, Any]]:
    """Split *image* into *rows* × *cols* cells.

    Returns a list of dicts, each containing the cell image slice,
    row/col indices, bounding box (x1, y1, x2, y2), and a label.
    """
    rows = rows or config.GRID_ROWS
    cols = cols or config.GRID_COLS
    h, w = image.shape[:2]
    cell_h, cell_w = h // rows, w // cols

    cells: list[dict[str, Any]] = []
    for r in range(rows):
        for c in range(cols):
            y1 = r * cell_h
            y2 = y1 + cell_h if r < rows - 1 else h
            x1 = c * cell_w
            x2 = x1 + cell_w if c < cols - 1 else w
            cells.append({
                "cell":  image[y1:y2, x1:x2],
                "row":   r,
                "col":   c,
                "bbox":  (x1, y1, x2, y2),
                "label": f"({r},{c})",
            })
    return cells
