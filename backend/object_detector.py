"""
AquaScan — Object Detector (v4.1)

Per-object bounding-box detection using classical CV.

v4.1 critical fixes:
  - Changed fusion from AND to OR-weighted (color OR structure fires)
  - Added specific trash-color targeting (white/translucent plastic, bright neon)
  - Lowered adaptive thresholds (LAB 2.0→1.2, sat 2.5→1.5)
  - Added HSV-based direct trash mask for bottles/bags
  - Larger morphological kernels for better blob formation
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt

import config

logger = logging.getLogger(__name__)

CvImage = npt.NDArray[np.uint8]
GrayImage = npt.NDArray[np.uint8]


@dataclass
class DetectedObject:
    """A single detected trash object."""
    bbox: tuple[int, int, int, int]  # (x1, y1, x2, y2)
    contour: Any                     # cv2 contour (for drawing)
    area: float
    category: str                    # 'bottle', 'bag', 'can', 'debris', 'unknown'
    confidence: float                # shape-match score 0-1
    features: dict[str, float]       # raw geometric features


# ── Segmentation helpers ────────────────────────────────────────

def _segment_by_color(image: CvImage, color_stats: dict | None = None) -> GrayImage:
    """Segment non-natural pixels using adaptive + absolute color filters.

    v4.1: Much more aggressive. Uses BOTH adaptive (deviation from image mean)
    AND absolute trash-color targeting (white plastic, bright artificial colors,
    very dark objects on light background, etc).
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, w = image.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    # ── Layer 1: Adaptive color deviation (if stats available) ──
    if color_stats is not None:
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
        lab_mean = color_stats["lab_mean"]
        lab_std = color_stats["lab_std"] + 1e-6

        diff = np.abs(lab - lab_mean.reshape(1, 1, 3))
        norm_diff = diff / lab_std.reshape(1, 1, 3)
        weights = np.array([1.2, 0.9, 0.9]).reshape(1, 1, 3)
        weighted_diff = (norm_diff * weights).mean(axis=2)

        # LOWERED threshold: 2.0 → 1.2 (catches more color outliers)
        adaptive_mask = (weighted_diff > 1.2).astype(np.uint8) * 255
        mask = cv2.bitwise_or(mask, adaptive_mask)

    # ── Layer 2: Absolute trash-color targeting ──────────────────
    hsv_u8 = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # White/light plastics (bags, styrofoam) — TIGHT range
    # Must be very low saturation AND very bright to avoid catching
    # bright coral, fish, or surface reflections
    white_mask = cv2.inRange(hsv_u8, np.array([0, 0, 210]), np.array([180, 35, 255]))
    mask = cv2.bitwise_or(mask, white_mask)

    # Red/orange packaging (unnatural in underwater scenes)
    red_mask1 = cv2.inRange(hsv_u8, np.array([0, 100, 100]), np.array([10, 255, 255]))
    red_mask2 = cv2.inRange(hsv_u8, np.array([170, 100, 100]), np.array([180, 255, 255]))
    mask = cv2.bitwise_or(mask, red_mask1)
    mask = cv2.bitwise_or(mask, red_mask2)

    # ── Layer 3: High saturation outliers (artificial packaging) ─
    if color_stats is not None:
        sat_mean = color_stats["hsv_mean"][1]
        sat_std = color_stats["hsv_std"][1] + 1e-6
        sat_dev = (hsv[:, :, 1] - sat_mean) / sat_std
        # LOWERED: 2.5 → 1.5
        sat_outlier = (sat_dev > 1.5).astype(np.uint8) * 255
        mask = cv2.bitwise_or(mask, sat_outlier)

        # Brightness outliers (very bright = plastic/foam)
        val_mean = color_stats["hsv_mean"][2]
        val_std = color_stats["hsv_std"][2] + 1e-6
        bright = ((hsv[:, :, 2] - val_mean) / val_std > 1.5).astype(np.uint8) * 255
        mask = cv2.bitwise_or(mask, bright)

    return mask


def _segment_by_edges(gray: GrayImage) -> GrayImage:
    """Auto-Canny edge detection with morphological closing to form regions."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    v = np.median(blurred)
    low = int(max(0, 0.67 * v))
    high = int(min(255, 1.33 * v))
    edges = cv2.Canny(blurred, low, high)

    # Close gaps to form connected regions — LARGER kernel for better blob formation
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=3)
    return closed


def _segment_adaptive(gray: GrayImage) -> GrayImage:
    """Adaptive threshold — catches objects Otsu misses in unimodal histograms."""
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 4
    )
    # Cleanup small noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    return binary


# ── Contour feature extraction ──────────────────────────────────

def _compute_contour_features(cnt) -> dict[str, float]:
    """Compute geometric features for a single contour."""
    area = cv2.contourArea(cnt)
    perimeter = cv2.arcLength(cnt, True)
    hull = cv2.convexHull(cnt)
    hull_area = cv2.contourArea(hull)

    x, y, bw, bh = cv2.boundingRect(cnt)
    rect_area = bw * bh

    solidity = area / hull_area if hull_area > 0 else 0
    aspect = max(bw, bh) / max(min(bw, bh), 1)
    rectangularity = area / rect_area if rect_area > 0 else 0
    circularity = (4 * np.pi * area) / (perimeter ** 2) if perimeter > 0 else 0
    compactness = (perimeter ** 2) / area if area > 0 else 0
    extent = area / rect_area if rect_area > 0 else 0

    return {
        "area": float(area),
        "perimeter": float(perimeter),
        "solidity": float(solidity),
        "aspect_ratio": float(aspect),
        "rectangularity": float(rectangularity),
        "circularity": float(circularity),
        "compactness": float(compactness),
        "extent": float(extent),
        "bbox_w": float(bw),
        "bbox_h": float(bh),
    }


# ── Shape classifier ───────────────────────────────────────────

def _classify_shape(features: dict[str, float]) -> tuple[str, float]:
    """Classify a contour as bottle/bag/can/debris based on shape features."""
    aspect = features["aspect_ratio"]
    solidity = features["solidity"]
    rect_fill = features["rectangularity"]
    circ = features["circularity"]

    scores = {}

    if aspect >= config.BOTTLE_ASPECT_MIN and rect_fill >= config.BOTTLE_RECT_FILL_MIN:
        scores["bottle"] = 0.3 + min(aspect / 5.0, 0.3) + rect_fill * 0.2 + solidity * 0.2
    else:
        scores["bottle"] = max(0, (aspect - 1.5) * 0.15 + (rect_fill - 0.4) * 0.2)

    if solidity < config.BAG_SOLIDITY_MAX:
        scores["bag"] = 0.4 + (1.0 - solidity) * 0.3 + (1.0 - rect_fill) * 0.2
    else:
        scores["bag"] = max(0, (0.6 - solidity) * 0.3)

    if circ >= config.CAN_CIRCULARITY_MIN:
        scores["can"] = 0.3 + circ * 0.4 + solidity * 0.2
    else:
        scores["can"] = max(0, (circ - 0.4) * 0.3)

    scores["debris"] = 0.15 + solidity * 0.1 + (1.0 - circ) * 0.05

    best_cat = max(scores, key=scores.get)
    best_score = min(max(scores[best_cat], 0.0), 1.0)

    if best_score < 0.25:
        return "debris", round(best_score, 3)

    return best_cat, round(best_score, 3)


# ── Main object detection ───────────────────────────────────────

def detect_objects(
    image: CvImage,
    color_stats: dict | None = None,
    min_area_frac: float = config.MIN_OBJ_AREA_IMAGE_FRAC,
    max_area_frac: float = config.MAX_OBJ_AREA_IMAGE_FRAC,
) -> list[DetectedObject]:
    """Detect individual trash objects in a full image using classical CV.

    v4.1 critical fix: Changed fusion from AND to OR-weighted.

    Previously: color AND (edges OR adaptive)
      → On colorful images, color mask is sparse → AND kills everything

    Now: (color_strong) OR (color_weak AND structure)
      → Color alone can fire if strong enough
      → Weak color + structure also fires
    """
    h, w = image.shape[:2]
    total_area = h * w
    min_area = int(total_area * min_area_frac)
    max_area = int(total_area * max_area_frac)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # ── Multi-channel segmentation ──────────────────────────────
    mask_color = _segment_by_color(image, color_stats)
    mask_edges = _segment_by_edges(gray)
    mask_adaptive = _segment_adaptive(gray)

    # v4.1 fix: (color AND structure) OR (strong_color_alone)
    # - Color + structural evidence = high confidence candidate
    # - Very strong color signal alone = also candidate (white plastic etc)
    structure_mask = cv2.bitwise_or(mask_edges, mask_adaptive)
    confirmed = cv2.bitwise_and(mask_color, structure_mask)

    # Strong color = pixels where color mask is dense (morphological threshold)
    kernel_dense = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    strong_color = cv2.erode(mask_color, kernel_dense, iterations=2)
    strong_color = cv2.dilate(strong_color, kernel_dense, iterations=3)

    # Combined = confirmed OR strong_color
    combined = cv2.bitwise_or(confirmed, strong_color)

    # ── Morphological cleanup (more aggressive to merge fragments) ─
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel_close, iterations=3)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel_open, iterations=2)

    # ── Contour extraction ──────────────────────────────────────
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    detected: list[DetectedObject] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        features = _compute_contour_features(cnt)

        # Skip very high-solidity, near-rectangular shapes (likely natural rock/coral)
        # Real trash tends to have solidity < 0.92 or aspect > 1.3
        if features["solidity"] > 0.95 and features["aspect_ratio"] < 1.2 and features["circularity"] > 0.7:
            continue

        category, confidence = _classify_shape(features)

        x, y, bw, bh = cv2.boundingRect(cnt)
        obj = DetectedObject(
            bbox=(x, y, x + bw, y + bh),
            contour=cnt,
            area=area,
            category=category,
            confidence=confidence,
            features=features,
        )
        detected.append(obj)

    detected.sort(key=lambda o: o.area, reverse=True)
    detected = _nms(detected, iou_thresh=0.4)

    logger.info("Object detector found %d candidate objects", len(detected))
    return detected


def _nms(objects: list[DetectedObject], iou_thresh: float = 0.4) -> list[DetectedObject]:
    """Simple non-maximum suppression to remove overlapping bounding boxes."""
    if len(objects) <= 1:
        return objects

    keep: list[DetectedObject] = []
    suppressed = set()

    for i, obj_i in enumerate(objects):
        if i in suppressed:
            continue
        keep.append(obj_i)
        for j in range(i + 1, len(objects)):
            if j in suppressed:
                continue
            if _iou(obj_i.bbox, objects[j].bbox) > iou_thresh:
                suppressed.add(j)

    return keep


def _iou(box1: tuple, box2: tuple) -> float:
    """Compute IoU between two bounding boxes (x1, y1, x2, y2)."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter

    return inter / union if union > 0 else 0.0


# ── Cell-level object signal ────────────────────────────────────

def compute_cell_object_signal(
    objects: list[DetectedObject],
    cell_bbox: tuple[int, int, int, int],
) -> float:
    """Compute what fraction of a cell is covered by detected objects."""
    cx1, cy1, cx2, cy2 = cell_bbox
    cell_area = (cx2 - cx1) * (cy2 - cy1)
    if cell_area <= 0:
        return 0.0

    covered = 0.0
    for obj in objects:
        ox1, oy1, ox2, oy2 = obj.bbox
        ix1 = max(cx1, ox1)
        iy1 = max(cy1, oy1)
        ix2 = min(cx2, ox2)
        iy2 = min(cy2, oy2)
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        covered += inter

    return min(covered / cell_area, 1.0)


def objects_to_json(objects: list[DetectedObject]) -> list[dict]:
    """Serialise detected objects for API response."""
    return [
        {
            "bbox": list(obj.bbox),
            "category": obj.category,
            "confidence": obj.confidence,
            "area": int(obj.area),
            "features": {k: round(v, 4) for k, v in obj.features.items()
                         if k not in ("bbox_w", "bbox_h")},
        }
        for obj in objects
    ]
