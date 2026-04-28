"""
AquaScan — ML Detector (v5)

YOLOv8-based object detection for underwater trash.

Uses pre-trained COCO weights to detect bottles, cups, bowls, bags, etc.
Falls back to classical CV (object_detector.py) if YOLO is unavailable.

COCO trash-relevant classes:
  24: backpack    → bag
  25: umbrella    → debris
  26: handbag     → bag
  28: suitcase    → bag
  39: bottle      → bottle
  40: wine glass  → debris
  41: cup         → can
  42: fork        → debris
  43: knife       → debris
  44: spoon       → debris
  45: bowl        → debris
  46: banana      → debris (organic)
  47: apple       → debris
  67: cell phone  → debris
  73: book        → debris
  76: scissors    → debris
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt

logger = logging.getLogger(__name__)

CvImage = npt.NDArray[np.uint8]

# Try to load YOLO
_yolo_available = False
_model = None

try:
    from ultralytics import YOLO
    _yolo_available = True
    logger.info("YOLOv8 (ultralytics) available")
except ImportError:
    logger.warning("ultralytics not installed — falling back to classical CV")


# ── COCO class mapping ──────────────────────────────────────────
# STRICT whitelist: ONLY items that are genuinely trash/waste underwater.
# Everything NOT in this list is EXCLUDED from detection.

TRASH_CLASSES: dict[int, str] = {
    # Containers & packaging — the most common underwater trash
    39: "bottle",    # bottle
    40: "debris",    # wine glass
    41: "can",       # cup
    45: "debris",    # bowl
    75: "debris",    # vase

    # Bags — second most common
    24: "bag",       # backpack
    26: "bag",       # handbag
    28: "bag",       # suitcase

    # Utensils — small debris
    42: "debris",    # fork
    43: "debris",    # knife
    44: "debris",    # spoon

    # Other man-made items that are trash underwater
    67: "debris",    # cell phone
    73: "debris",    # book
    76: "debris",    # scissors
    79: "debris",    # toothbrush
}

# EVERYTHING not in TRASH_CLASSES is excluded.
# This prevents fish, coral, rocks from being misidentified as
# "kite", "surfboard", "sports ball", "boat" etc.
# We use a whitelist approach: if it's not in TRASH_CLASSES, reject it.

ALL_COCO_NAMES = {}  # Will be populated from model


@dataclass
class MLDetection:
    """A single ML-detected object."""
    bbox: tuple[int, int, int, int]  # (x1, y1, x2, y2)
    category: str                    # 'bottle', 'bag', 'can', 'debris'
    confidence: float                # 0-1 actual model confidence
    coco_class: int                  # original COCO class ID
    coco_name: str                   # original COCO class name
    contour: Any = None              # optional contour for drawing


def load_model(model_name: str = "yolov8s.pt") -> bool:
    """Load YOLOv8 model. Downloads weights on first run (~22MB for yolov8s)."""
    global _model, _yolo_available, ALL_COCO_NAMES

    if not _yolo_available:
        return False

    try:
        _model = YOLO(model_name)
        ALL_COCO_NAMES = _model.names
        logger.info("Loaded YOLO model: %s (%d classes)", model_name, len(ALL_COCO_NAMES))
        return True
    except Exception:
        logger.exception("Failed to load YOLO model")
        _model = None
        return False


def is_available() -> bool:
    """Check if ML detection is ready."""
    return _yolo_available and _model is not None


def detect(
    image: CvImage,
    conf_threshold: float = 0.25,
    iou_threshold: float = 0.45,
    imgsz: int = 640,
) -> list[MLDetection]:
    """Run YOLOv8 inference on an image.

    Returns list of MLDetection objects for trash-relevant classes.
    """
    if not is_available():
        return []

    try:
        # Run inference
        results = _model(
            image,
            conf=conf_threshold,
            iou=iou_threshold,
            imgsz=imgsz,
            verbose=False,
            device="cpu",
        )

        detections: list[MLDetection] = []

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()

                # WHITELIST approach: ONLY accept trash classes
                # Skip everything NOT in TRASH_CLASSES (kite, surfboard,
                # sports ball, boat, etc. are NOT trash)
                if cls_id not in TRASH_CLASSES:
                    continue

                category = TRASH_CLASSES[cls_id]
                coco_name = ALL_COCO_NAMES.get(cls_id, f"class_{cls_id}")

                det = MLDetection(
                    bbox=(int(x1), int(y1), int(x2), int(y2)),
                    category=category,
                    confidence=round(conf, 3),
                    coco_class=cls_id,
                    coco_name=coco_name,
                )
                detections.append(det)

        # Sort by confidence (highest first)
        detections.sort(key=lambda d: d.confidence, reverse=True)

        logger.info("YOLO detected %d trash objects (from %d total detections)",
                     len(detections),
                     sum(len(r.boxes) for r in results if r.boxes is not None))
        return detections

    except Exception:
        logger.exception("YOLO inference failed")
        return []


def draw_detections(
    image: CvImage,
    detections: list[MLDetection],
    draw_circles: bool = True,
) -> CvImage:
    """Draw circles/ellipses and labels around detected trash objects.

    Uses double-draw technique: thick dark outline + thin bright fill
    for a glowing effect.
    """
    output = image.copy()
    h, w = output.shape[:2]

    cat_colors = {
        "bottle": (255, 200, 0),     # cyan (BGR)
        "bag":    (255, 100, 255),    # magenta
        "can":    (200, 255, 0),      # teal
        "debris": (255, 180, 100),    # light blue
    }

    for det in detections:
        x1, y1, x2, y2 = det.bbox
        color = cat_colors.get(det.category, (180, 180, 180))

        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        rx = (x2 - x1) // 2
        ry = (y2 - y1) // 2

        if draw_circles:
            # Outer glow (thick, darker)
            glow_color = tuple(max(0, c - 80) for c in color)
            cv2.ellipse(output, (cx, cy), (rx + 4, ry + 4), 0, 0, 360,
                       glow_color, 4, cv2.LINE_AA)
            # Main ellipse
            cv2.ellipse(output, (cx, cy), (rx + 1, ry + 1), 0, 0, 360,
                       color, 2, cv2.LINE_AA)
            # Corner markers (crosshair style)
            marker_len = max(8, min(rx, ry) // 3)
            # Top-left
            cv2.line(output, (x1, y1), (x1 + marker_len, y1), color, 2, cv2.LINE_AA)
            cv2.line(output, (x1, y1), (x1, y1 + marker_len), color, 2, cv2.LINE_AA)
            # Top-right
            cv2.line(output, (x2, y1), (x2 - marker_len, y1), color, 2, cv2.LINE_AA)
            cv2.line(output, (x2, y1), (x2, y1 + marker_len), color, 2, cv2.LINE_AA)
            # Bottom-left
            cv2.line(output, (x1, y2), (x1 + marker_len, y2), color, 2, cv2.LINE_AA)
            cv2.line(output, (x1, y2), (x1, y2 - marker_len), color, 2, cv2.LINE_AA)
            # Bottom-right
            cv2.line(output, (x2, y2), (x2 - marker_len, y2), color, 2, cv2.LINE_AA)
            cv2.line(output, (x2, y2), (x2, y2 - marker_len), color, 2, cv2.LINE_AA)
        else:
            # Simple rectangle
            cv2.rectangle(output, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)

        # Label background
        label = f"{det.coco_name} {int(det.confidence * 100)}%"
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        # Semi-transparent label background
        overlay = output.copy()
        cv2.rectangle(overlay, (x1, y1 - th - 10), (x1 + tw + 10, y1), color, -1)
        cv2.addWeighted(overlay, 0.7, output, 0.3, 0, output)
        cv2.putText(output, label, (x1 + 5, y1 - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2, cv2.LINE_AA)
        cv2.putText(output, label, (x1 + 5, y1 - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    return output


def detections_to_json(detections: list[MLDetection]) -> list[dict]:
    """Serialize ML detections for API response."""
    return [
        {
            "bbox": list(d.bbox),
            "category": d.category,
            "confidence": d.confidence,
            "coco_class": d.coco_class,
            "coco_name": d.coco_name,
            "area": (d.bbox[2] - d.bbox[0]) * (d.bbox[3] - d.bbox[1]),
        }
        for d in detections
    ]


def compute_cell_ml_signal(
    detections: list[MLDetection],
    cell_bbox: tuple[int, int, int, int],
) -> float:
    """Compute what fraction of a cell is covered by ML detections."""
    cx1, cy1, cx2, cy2 = cell_bbox
    cell_area = (cx2 - cx1) * (cy2 - cy1)
    if cell_area <= 0:
        return 0.0

    covered = 0.0
    for det in detections:
        ox1, oy1, ox2, oy2 = det.bbox
        ix1 = max(cx1, ox1)
        iy1 = max(cy1, oy1)
        ix2 = min(cx2, ox2)
        iy2 = min(cy2, oy2)
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        covered += inter

    return min(covered / cell_area, 1.0)
