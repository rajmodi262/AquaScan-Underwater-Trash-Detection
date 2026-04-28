"""
AquaScan — Detector (v4)

ADAPTIVE z-score detection pipeline with per-object awareness.

v4 changes from v3:
  - Auto-Canny (median-based thresholds) replaces fixed 50/150
  - Adaptive color model (image-relative LAB/HSV) replaces hardcoded range
  - Adaptive thresholding replaces Otsu for shape analysis
  - Morphological cleanup on contour extraction
  - Hanning window before FFT to eliminate cell-boundary artifacts
  - Object-presence signal integrated as 6th check
  - Laplacian variance added as secondary texture measure

Checks:
  A — Edge density        (auto-Canny)
  B — Shape irregularity  (adaptive threshold + morphological contours)
  C — Color anomaly       (image-adaptive LAB/HSV model)
  D — Texture entropy     (LBP + Laplacian variance)
  E — Frequency anomaly   (windowed FFT)
  F — Object presence     (from object_detector module)
"""
from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt

import config
from config import DetectionConfig

logger = logging.getLogger(__name__)

# Type aliases
GrayImage = npt.NDArray[np.uint8]
ColorImage = npt.NDArray[np.uint8]
CellResult = dict[str, Any]


# ================================================================
#  Raw signal extractors — return a continuous float, NO thresholding
# ================================================================

def _edge_density(gray: GrayImage) -> float:
    """Auto-Canny edge pixel ratio.

    Uses median-based thresholds instead of fixed values.
    This adapts to the actual contrast of the cell — critical for
    underwater images where contrast varies wildly with depth/turbidity.
    """
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    v = float(np.median(blurred))
    low = int(max(0, 0.67 * v))
    high = int(min(255, 1.33 * v))
    # Ensure minimum separation between thresholds
    if high - low < 20:
        low = max(0, int(v) - 15)
        high = min(255, int(v) + 15)
    edges = cv2.Canny(blurred, low, high)
    return float(np.count_nonzero(edges)) / max(edges.size, 1)


def _shape_irregularity(gray: GrayImage, solidity_thresh: float) -> float:
    """Fraction of contours with irregular shapes.

    v4 fix: Uses adaptive thresholding instead of Otsu.
    Otsu assumes bimodal histogram — underwater cells are typically unimodal,
    causing Otsu to produce all-white or all-black masks → garbage contours.

    Also uses morphological cleanup to remove noise contours and computes
    multiple shape features beyond just solidity.
    """
    h, w = gray.shape[:2]
    if h < 8 or w < 8:
        return 0.0

    # Adaptive threshold handles unimodal histograms correctly
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 3
    )

    # Morphological cleanup: remove noise, connect fragments
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Scale-aware minimum area: at least 0.5% of cell area
    min_area = max(config.MIN_CONTOUR_AREA, int(h * w * 0.005))

    irregular = 0
    valid = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        hull_area = cv2.contourArea(cv2.convexHull(cnt))
        if hull_area < 1:
            continue
        valid += 1

        solidity = area / hull_area
        # Also check aspect ratio — man-made objects tend to be more elongated
        _, _, bw, bh = cv2.boundingRect(cnt)
        aspect = max(bw, bh) / max(min(bw, bh), 1)

        # Flag if low solidity OR very elongated (trash-like shapes)
        if solidity < solidity_thresh or aspect > 3.5:
            irregular += 1

    return irregular / valid if valid > 0 else 0.0


def _color_anomaly_adaptive(cell_bgr: ColorImage, color_stats: dict | None) -> float:
    """Fraction of pixels that deviate from the image's own color distribution.

    v4.1: Uses BOTH adaptive (LAB deviation) AND absolute trash-color targeting.
    Takes the MAX of adaptive and fixed scores so neither pathway can suppress
    the other.
    """
    if color_stats is None:
        return _color_anomaly_fixed(cell_bgr)

    lab = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_mean = color_stats["lab_mean"]
    lab_std = color_stats["lab_std"] + 1e-6

    # Per-pixel normalised deviation in LAB space
    diff = np.abs(lab - lab_mean.reshape(1, 1, 3))
    norm_diff = diff / lab_std.reshape(1, 1, 3)

    weights = np.array([1.3, 0.85, 0.85]).reshape(1, 1, 3)
    pixel_deviation = (norm_diff * weights).mean(axis=2)

    # HSV saturation outliers
    hsv = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    sat_mean = color_stats["hsv_mean"][1]
    sat_std = color_stats["hsv_std"][1] + 1e-6
    sat_deviation = (hsv[:, :, 1] - sat_mean) / sat_std

    # v4.1: LOWERED thresholds (1.8→1.2, 2.0→1.5)
    anomalous = ((pixel_deviation > 1.2) | (sat_deviation > 1.5)).astype(np.float32)
    adaptive_score = float(anomalous.mean())

    # Also add absolute trash-color hits (white plastic, bright packaging)
    # TIGHT ranges to avoid catching coral/fish/surface reflections
    hsv_u8 = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv_u8, np.array([0, 0, 210]), np.array([180, 35, 255]))
    red1 = cv2.inRange(hsv_u8, np.array([0, 100, 100]), np.array([10, 255, 255]))
    red2 = cv2.inRange(hsv_u8, np.array([170, 100, 100]), np.array([180, 255, 255]))
    abs_mask = cv2.bitwise_or(white, cv2.bitwise_or(red1, red2))
    abs_score = float(np.count_nonzero(abs_mask)) / max(abs_mask.size, 1)

    # Take MAX of adaptive and absolute — so neither suppresses the other
    return max(adaptive_score, abs_score)


def _color_anomaly_fixed(cell_bgr: ColorImage) -> float:
    """Fallback: fraction of pixels outside hardcoded natural underwater HSV range."""
    hsv = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2HSV)
    lower = np.array([config.NATURAL_HUE_LOW, config.NATURAL_SAT_LOW, config.NATURAL_VAL_LOW])
    upper = np.array([config.NATURAL_HUE_HIGH, config.NATURAL_SAT_HIGH, config.NATURAL_VAL_HIGH])
    natural = cv2.inRange(hsv, lower, upper)
    return 1.0 - float(np.count_nonzero(natural)) / max(natural.size, 1)


def _compute_lbp(gray: GrayImage) -> npt.NDArray[np.uint8]:
    """Simplified rotation-invariant LBP (8 neighbours, radius 1)."""
    h, w = gray.shape
    lbp = np.zeros((h - 2, w - 2), dtype=np.uint8)
    centre = gray[1:-1, 1:-1].astype(np.int16)
    for dy, dx in [(-1, -1), (-1, 0), (-1, 1), (0, 1),
                   (1, 1),   (1, 0),  (1, -1), (0, -1)]:
        neighbour = gray[1 + dy:h - 1 + dy, 1 + dx:w - 1 + dx].astype(np.int16)
        lbp = (lbp << 1) | (neighbour >= centre).astype(np.uint8)
    return lbp


def _texture_entropy(gray: GrayImage) -> float:
    """Shannon entropy of LBP histogram + Laplacian variance blend.

    v4: added Laplacian variance as secondary measure. Laplacian variance
    captures focus/sharpness — trash in underwater images often appears
    sharper than the surrounding water/sand due to different depth of field.
    Normalised and blended with LBP entropy.
    """
    if gray.shape[0] < 4 or gray.shape[1] < 4:
        return 0.0

    # LBP entropy (same as v3)
    lbp = _compute_lbp(gray)
    hist, _ = np.histogram(lbp, bins=64, range=(0, 256))
    hist = hist.astype(np.float64)
    hist /= hist.sum() + 1e-10
    entropy = -float(np.sum(hist[hist > 0] * np.log2(hist[hist > 0])))
    lbp_score = entropy / np.log2(64)  # normalise to 0-1

    # Laplacian variance (focus/sharpness measure)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    lap_var = float(lap.var())
    # Normalise: typical underwater values 0-2000, clamp to 0-1
    lap_score = min(lap_var / 1500.0, 1.0)

    # Blend: 60% LBP, 40% Laplacian
    return 0.6 * lbp_score + 0.4 * lap_score


def _frequency_energy(gray: GrayImage) -> float:
    """Ratio of high-frequency spectral energy via windowed FFT.

    v4 fix: applies Hanning window before FFT to eliminate artifacts
    from cell boundaries. Without windowing, the rectangular cell
    boundary creates artificial high-frequency content → false signals.
    """
    if gray.shape[0] < 8 or gray.shape[1] < 8:
        return 0.0

    h, w = gray.shape

    # Apply 2D Hanning window to suppress boundary artifacts
    win_h = np.hanning(h).reshape(-1, 1)
    win_w = np.hanning(w).reshape(1, -1)
    window = (win_h @ win_w).astype(np.float32)
    windowed = gray.astype(np.float32) * window

    f = np.fft.fft2(windowed)
    fshift = np.fft.fftshift(f)
    magnitude = np.log1p(np.abs(fshift))

    cy, cx = h // 2, w // 2
    # Use multiple frequency bands instead of single cutoff
    r_low = min(cy, cx) // 4
    r_mid = min(cy, cx) // 2
    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((y - cy) ** 2 + (x - cx) ** 2)

    low_mask = dist <= r_low
    mid_mask = (dist > r_low) & (dist <= r_mid)
    high_mask = dist > r_mid

    total = float(magnitude.sum()) + 1e-10
    low_energy = float(magnitude[low_mask].sum()) / total
    mid_energy = float(magnitude[mid_mask].sum()) / total
    high_energy = float(magnitude[high_mask].sum()) / total

    # High freq ratio, weighted by mid+high bands
    return 0.4 * mid_energy + 0.6 * high_energy


# ================================================================
#  Two-pass adaptive scoring
# ================================================================

def extract_raw_signals(
    cells: list[dict],
    cfg: DetectionConfig,
    color_stats: dict | None = None,
    object_signals: list[float] | None = None,
) -> list[dict[str, float]]:
    """Pass 1: Compute raw signal values for every cell."""
    signals: list[dict[str, float]] = []
    for i, cell in enumerate(cells):
        bgr = cell["cell"]
        if bgr is None or bgr.size == 0:
            signals.append({"edge": 0.0, "shape": 0.0, "color": 0.0,
                            "texture": 0.0, "freq": 0.0, "object": 0.0})
            continue

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Use adaptive color model if available
        if cfg.color_model == 'adaptive' and color_stats is not None:
            color_val = _color_anomaly_adaptive(bgr, color_stats)
        else:
            color_val = _color_anomaly_fixed(bgr)

        # Object signal from object_detector module
        obj_signal = object_signals[i] if object_signals is not None else 0.0

        signals.append({
            "edge":    _edge_density(gray),
            "shape":   _shape_irregularity(gray, cfg.solidity_thresh),
            "color":   color_val,
            "texture": _texture_entropy(gray),
            "freq":    _frequency_energy(gray),
            "object":  obj_signal,
        })
    return signals


def score_all_cells(
    cells: list[dict],
    cfg: DetectionConfig | None = None,
    color_stats: dict | None = None,
    object_signals: list[float] | None = None,
) -> list[dict]:
    """Two-pass adaptive detection.

    Pass 1: extract raw signals for all cells.
    Pass 2: compute per-signal mean+std across the image, then flag
            cells where signal > mean + outlier_sigma * std.
    """
    if cfg is None:
        cfg = DetectionConfig()

    n = len(cells)
    if n == 0:
        return cells

    # ── Pass 1: raw signals ─────────────────────────────────────
    raw = extract_raw_signals(cells, cfg, color_stats, object_signals)

    # ── Compute image-level baselines ───────────────────────────
    signal_keys = ["edge", "shape", "color", "texture", "freq", "object"]
    means: dict[str, float] = {}
    stds: dict[str, float] = {}
    for key in signal_keys:
        vals = np.array([r[key] for r in raw])
        means[key] = float(vals.mean())
        stds[key] = float(vals.std()) + 1e-8  # avoid div-by-zero

    logger.debug("Image baselines: %s", {k: f"{means[k]:.3f}±{stds[k]:.3f}" for k in signal_keys})

    # ── Pass 2: adaptive thresholding + scoring ─────────────────
    check_keys = ["check_a", "check_b", "check_c", "check_d", "check_e", "check_f"]
    signal_map = list(zip(signal_keys, check_keys))
    weights = [cfg.w_edge, cfg.w_shape, cfg.w_color, cfg.w_texture, cfg.w_freq, cfg.w_object]

    # ── Absolute raw-signal floors ───────────────────────────────
    # When a signal is absolutely high, flag it even if the z-score
    # doesn't cross the threshold (handles uniformly-trashed images
    # where std is high and z-scores are compressed)
    ABS_FLOORS = {
        "color": 0.35,   # >35% non-natural pixels = suspicious
        "edge": 0.18,    # >18% edge density = lots of structure
        "shape": 0.30,   # >30% irregular contours
        "object": 0.10,  # >10% cell covered by detected objects
    }

    for i, cell in enumerate(cells):
        r = raw[i]
        z_scores: dict[str, float] = {}
        checks: dict[str, bool] = {}

        for (sk, ck) in signal_map:
            z = (r[sk] - means[sk]) / stds[sk]
            z_scores[sk] = z
            # z-score check OR absolute floor check
            checks[ck] = bool(z > cfg.outlier_sigma or r[sk] > ABS_FLOORS.get(sk, 999))

        checks_passed = sum(checks.values())
        is_trash = checks_passed >= cfg.checks_to_flag

        # ── Anomaly score: weighted sum of clamped z-scores ─────
        # NOT a probability — it's a relative deviation measure
        weighted = 0.0
        for j, (sk, _) in enumerate(signal_map):
            # Clamp z to [0, 3], normalise to [0, 1]
            z_norm = max(0.0, min(z_scores[sk] / 3.0, 1.0))
            weighted += weights[j] * z_norm

        # Also add raw object signal contribution (absolute, not just relative)
        if object_signals is not None:
            weighted += 0.08 * min(r["object"], 1.0)

        # Apply cross-check boost (more checks = higher certainty)
        if checks_passed >= 5:
            weighted = min(weighted * 1.30, 1.0)
        elif checks_passed >= 4:
            weighted = min(weighted * 1.20, 1.0)
        elif checks_passed >= 3:
            weighted = min(weighted * 1.10, 1.0)

        anomaly_score = round(float(min(weighted, 1.0)), 4)

        cell["result"] = {
            "is_trash":       bool(is_trash),
            "anomaly_score":  anomaly_score,
            "checks_passed":  int(checks_passed),
            "edge_density":   float(round(r["edge"], 4)),
            "shape_score":    float(round(r["shape"], 4)),
            "color_ratio":    float(round(r["color"], 4)),
            "texture_score":  float(round(r["texture"], 4)),
            "freq_score":     float(round(r["freq"], 4)),
            "object_score":   float(round(r["object"], 4)),
            "check_a":        checks["check_a"],
            "check_b":        checks["check_b"],
            "check_c":        checks["check_c"],
            "check_d":        checks["check_d"],
            "check_e":        checks["check_e"],
            "check_f":        checks["check_f"],
            # Z-scores for transparency
            "z_edge":    float(round(z_scores["edge"], 2)),
            "z_shape":   float(round(z_scores["shape"], 2)),
            "z_color":   float(round(z_scores["color"], 2)),
            "z_texture": float(round(z_scores["texture"], 2)),
            "z_freq":    float(round(z_scores["freq"], 2)),
            "z_object":  float(round(z_scores["object"], 2)),
        }

    return cells


def frame_summary(cells: list[dict]) -> dict[str, Any]:
    """Compute frame-level aggregate statistics."""
    total = len(cells)
    if total == 0:
        return {"total_cells": 0, "trash_cells": 0, "clean_cells": 0,
                "avg_anomaly_score": 0.0, "trash_density_pct": 0.0}
    trash_count = sum(1 for c in cells if c["result"]["is_trash"])
    avg_score = sum(c["result"]["anomaly_score"] for c in cells) / total
    return {
        "total_cells":       total,
        "trash_cells":       trash_count,
        "clean_cells":       total - trash_count,
        "avg_anomaly_score": round(avg_score, 4),
        "trash_density_pct": round(trash_count / total * 100, 1),
    }


# ── Legacy compatibility shim ─────────────────────────────────
def score_cell(cell_bgr: ColorImage, cfg: DetectionConfig | None = None) -> CellResult:
    """Score a single cell (used by tests). Wraps two-pass with n=1."""
    if cfg is None:
        cfg = DetectionConfig()
    if cell_bgr is None or cell_bgr.size == 0:
        return _empty_result()
    cells = [{"cell": cell_bgr, "row": 0, "col": 0, "bbox": (0, 0, 0, 0), "label": "(0,0)"}]
    score_all_cells(cells, cfg)
    return cells[0]["result"]


def _empty_result() -> CellResult:
    return {
        "is_trash": False, "anomaly_score": 0.0, "checks_passed": 0,
        "edge_density": 0.0, "shape_score": 0.0, "color_ratio": 0.0,
        "texture_score": 0.0, "freq_score": 0.0, "object_score": 0.0,
        "check_a": False, "check_b": False, "check_c": False,
        "check_d": False, "check_e": False, "check_f": False,
        "z_edge": 0.0, "z_shape": 0.0, "z_color": 0.0,
        "z_texture": 0.0, "z_freq": 0.0, "z_object": 0.0,
    }
