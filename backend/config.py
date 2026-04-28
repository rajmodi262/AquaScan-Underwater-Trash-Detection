"""
AquaScan — Configuration (v4)

Thread-safe, immutable defaults + per-request DetectionConfig dataclass.
Global constants remain module-level; mutable per-request params are
carried in DetectionConfig so concurrent requests never collide.

v4 changes:
  - Auto-Canny parameters
  - Adaptive color model (image-relative, not hardcoded HSV)
  - Object detector contour thresholds
  - Multi-scale grid parameters
  - Shape classifier thresholds
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Final, Tuple

# ── Grid ────────────────────────────────────────────────────────
GRID_ROWS: Final[int] = 4
GRID_COLS: Final[int] = 4

# ── Frame resize ────────────────────────────────────────────────
FRAME_WIDTH:  Final[int] = 1280
FRAME_HEIGHT: Final[int] = 720

# ── Preprocessing ───────────────────────────────────────────────
CLAHE_CLIP_LIMIT:      Final[float]          = 2.0
CLAHE_TILE_SIZE:       Final[Tuple[int,int]] = (8, 8)
RED_BOOST:             Final[int]            = 25
BILATERAL_D:           Final[int]            = 9
BILATERAL_SIGMA_COLOR: Final[int]            = 75
BILATERAL_SIGMA_SPACE: Final[int]            = 75

# ── Canny (now used as fallback; auto-Canny is default) ────────
CANNY_LOW:  Final[int] = 50
CANNY_HIGH: Final[int] = 150

# ── Contour ─────────────────────────────────────────────────────
MIN_CONTOUR_AREA: Final[int] = 100

# ── HSV natural range (legacy — used as fallback if adaptive fails)
NATURAL_HUE_LOW:  Final[int] = 80
NATURAL_HUE_HIGH: Final[int] = 160
NATURAL_SAT_LOW:  Final[int] = 25
NATURAL_SAT_HIGH: Final[int] = 140
NATURAL_VAL_LOW:  Final[int] = 25
NATURAL_VAL_HIGH: Final[int] = 210

# ── Object Detection — contour filtering ────────────────────────
# Minimum contour area as fraction of cell area
MIN_OBJECT_AREA_FRAC: Final[float] = 0.005
# Maximum contour area as fraction of cell area (ignore if >80% of cell)
MAX_OBJECT_AREA_FRAC: Final[float] = 0.80
# Minimum contour area as fraction of full image for object detector
MIN_OBJ_AREA_IMAGE_FRAC: Final[float] = 0.0008
MAX_OBJ_AREA_IMAGE_FRAC: Final[float] = 0.12

# ── Shape classifier thresholds ─────────────────────────────────
# Bottles: elongated, high rectangularity
BOTTLE_ASPECT_MIN: Final[float] = 2.0
BOTTLE_RECT_FILL_MIN: Final[float] = 0.55
# Bags: low solidity, irregular
BAG_SOLIDITY_MAX: Final[float] = 0.55
BAG_AREA_RATIO_MAX: Final[float] = 0.45
# Cans/caps: circular
CAN_CIRCULARITY_MIN: Final[float] = 0.65

# ── Multi-scale grid ───────────────────────────────────────────
MULTI_SCALE_GRIDS: Final[list] = [(3, 3), (5, 5), (8, 8)]
MULTI_SCALE_WEIGHTS: Final[list] = [0.25, 0.45, 0.30]

# ── Video ───────────────────────────────────────────────────────
PROCESS_EVERY_N_FRAMES: Final[int] = 3

# ── Paths ───────────────────────────────────────────────────────
BASE_DIR:       Final[str] = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR:    Final[str] = os.path.dirname(BASE_DIR)
DATA_DIR:       Final[str] = os.path.join(PROJECT_DIR, "data")
SAMPLE_DIR:     Final[str] = os.path.join(DATA_DIR, "sample_images")
OUTPUT_DIR:     Final[str] = os.path.join(DATA_DIR, "output")
ANNOTATION_DIR: Final[str] = os.path.join(DATA_DIR, "annotations")
MODEL_DIR:      Final[str] = os.path.join(DATA_DIR, "models")


@dataclass(frozen=True)
class DetectionConfig:
    """Per-request detection parameters — thread-safe and immutable.

    The adaptive z-score system uses `outlier_sigma` to determine how many
    standard deviations above the image mean a cell must be to flag.
    """
    # Adaptive outlier threshold (z-score): flag cells > mean + sigma * std
    outlier_sigma: float = 1.5

    # Minimum checks that must fire to flag a cell
    checks_to_flag: int = 2

    # Weight blend for composite anomaly score
    w_edge:    float = 0.20
    w_shape:   float = 0.15
    w_color:   float = 0.28
    w_texture: float = 0.17
    w_freq:    float = 0.10
    w_object:  float = 0.10  # NEW: weight for object-presence signal

    # Shape solidity threshold (absolute, not adaptive)
    solidity_thresh: float = 0.75

    # Dehaze toggle
    dehaze: bool = True

    # Object detection toggle
    enable_object_detection: bool = True

    # Multi-scale grid toggle
    enable_multi_scale: bool = True

    # Color model: 'adaptive' (compute from image) or 'fixed' (hardcoded HSV)
    color_model: str = 'adaptive'
