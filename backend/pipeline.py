"""
AquaScan - Pipeline (v5)

Thread-safe pipeline using DetectionConfig dataclass.

v5 changes:
  - YOLOv8 ML detection as PRIMARY detector (COCO pre-trained)
  - Classical CV as secondary/fallback
  - Circle/ellipse annotations with glow effect
  - ML detections merged with classical for cell scoring
"""
from __future__ import annotations

import base64
import logging
import time
from typing import Any, Optional

import cv2
import numpy as np
import numpy.typing as npt
from PIL import Image, ImageDraw, ImageFont

import config
import detector
import grid_engine
import preprocessor
import object_detector as objdet
import ml_detector
from config import DetectionConfig

logger = logging.getLogger(__name__)

CvImage = npt.NDArray[np.uint8]

# Auto-load YOLO model on import
_ml_loaded = False


class Pipeline:
    """Main detection pipeline — accepts raw bytes, returns full results."""

    def process(
        self,
        image_bytes: bytes,
        grid_rows: int = 4,
        grid_cols: int = 4,
        cfg: DetectionConfig | None = None,
    ) -> dict[str, Any]:
        if cfg is None:
            cfg = DetectionConfig()
        try:
            return self._run(image_bytes, grid_rows, grid_cols, cfg)
        except Exception:
            logger.exception("Pipeline processing failed")
            raise

    # ── Core ──────────────────────────────────────────────────────
    def _run(
        self,
        image_bytes: bytes,
        grid_rows: int,
        grid_cols: int,
        cfg: DetectionConfig,
    ) -> dict[str, Any]:
        global _ml_loaded
        t0 = time.perf_counter()

        src = self._decode(image_bytes)
        processed = preprocessor.preprocess(src, apply_dehaze=cfg.dehaze)

        # Compute image-level color statistics for adaptive detection
        color_stats = preprocessor.compute_image_color_stats(processed)

        # ── ML Detection (YOLO - primary) ────────────────────────
        # Run YOLO on ORIGINAL image (not preprocessed) — dehazing
        # and white balance confuse the COCO-trained model.
        # Then scale bboxes to processed image coordinates.
        ml_detections: list = []
        if not _ml_loaded:
            _ml_loaded = ml_detector.load_model("yolov8s.pt")

        if ml_detector.is_available():
            try:
                ml_detections = ml_detector.detect(
                    src, conf_threshold=0.15, iou_threshold=0.4,
                    imgsz=1280,
                )
                # Scale bboxes from src resolution to processed resolution
                sh, sw = src.shape[:2]
                ph, pw = processed.shape[:2]
                sx, sy = pw / sw, ph / sh
                for det in ml_detections:
                    x1, y1, x2, y2 = det.bbox
                    det.bbox = (
                        int(x1 * sx), int(y1 * sy),
                        int(x2 * sx), int(y2 * sy),
                    )
                logger.info("YOLO found %d objects", len(ml_detections))
            except Exception:
                logger.warning("ML detection failed, using classical CV only", exc_info=True)

        # ── Classical CV detection (secondary/fallback) ──────────
        cv_objects: list[objdet.DetectedObject] = []
        if cfg.enable_object_detection:
            try:
                cv_objects = objdet.detect_objects(processed, color_stats)
            except Exception:
                logger.warning("Classical CV detection failed", exc_info=True)

        # ── Grid-level detection ─────────────────────────────────
        if cfg.enable_multi_scale:
            cells, grid_rows_used, grid_cols_used = self._multi_scale_detect(
                processed, cfg, color_stats, cv_objects, ml_detections
            )
        else:
            cells = grid_engine.create_grid(processed, rows=grid_rows, cols=grid_cols)
            obj_signals = self._compute_combined_cell_signals(
                cells, cv_objects, ml_detections
            )
            cells = detector.score_all_cells(cells, cfg, color_stats, obj_signals)
            grid_rows_used, grid_cols_used = grid_rows, grid_cols

        summary = detector.frame_summary(cells)

        # ── Total objects = ML + CV ──────────────────────────────
        total_objects = len(ml_detections) + len(cv_objects)

        # ── Visualisation ────────────────────────────────────────
        annotated = processed.copy()
        # Draw ML detections with circles
        if ml_detections:
            annotated = ml_detector.draw_detections(annotated, ml_detections, draw_circles=True)
        # Draw classical CV detections with circles too
        if cv_objects:
            cv_as_ml = [
                ml_detector.MLDetection(
                    bbox=obj.bbox,
                    category=obj.category,
                    confidence=obj.confidence,
                    coco_class=-1,
                    coco_name=obj.category,
                )
                for obj in cv_objects
            ]
            annotated = ml_detector.draw_detections(annotated, cv_as_ml, draw_circles=True)
        annotated = self._draw_annotated(annotated, cells, summary, [])
        heatmap = self._draw_heatmap(cells, grid_rows_used, grid_cols_used, processed.shape)

        elapsed = round((time.perf_counter() - t0) * 1000)
        summary["processing_time_ms"] = elapsed
        summary["objects_detected"] = total_objects
        summary["ml_objects"] = len(ml_detections)
        summary["cv_objects"] = len(cv_objects)
        summary["ml_available"] = ml_detector.is_available()
        logger.info("Processed %dx%d in %dms - density %.1f%% - %d ML + %d CV objects",
                     src.shape[1], src.shape[0], elapsed,
                     summary["trash_density_pct"],
                     len(ml_detections), len(cv_objects))

        cells_json: list[dict[str, Any]] = []
        for c in cells:
            cells_json.append({
                "row": c["row"], "col": c["col"], "label": c["label"],
                "bbox": list(c["bbox"]), **c["result"],
            })

        objects_json = ml_detector.detections_to_json(ml_detections)
        objects_json.extend(objdet.objects_to_json(cv_objects))

        return {
            "summary": summary,
            "cells":   cells_json,
            "objects": objects_json,
            "images": {
                "original":     self._encode(src),
                "preprocessed": self._encode(processed),
                "annotated":    self._encode(annotated),
                "heatmap":      self._encode(heatmap),
            },
        }

    def _compute_combined_cell_signals(
        self,
        cells: list[dict],
        cv_objects: list,
        ml_detections: list,
    ) -> list[float]:
        """Compute per-cell object signals from both ML and classical detections."""
        signals = []
        for c in cells:
            cv_sig = objdet.compute_cell_object_signal(cv_objects, c["bbox"])
            ml_sig = ml_detector.compute_cell_ml_signal(ml_detections, c["bbox"])
            # Take max of the two signals
            signals.append(max(cv_sig, ml_sig))
        return signals

    def _multi_scale_detect(
        self,
        processed: CvImage,
        cfg: DetectionConfig,
        color_stats: dict,
        cv_objects: list,
        ml_detections: list | None = None,
    ) -> tuple[list[dict], int, int]:
        """Run detection at multiple grid scales and fuse results.

        Runs at 3x3, 5x5, 8x8 grids. For each cell in the primary grid
        (5x5), accumulates weighted anomaly signals from overlapping cells
        at other scales. This catches both large objects (3x3) and small
        objects (8x8) that a single scale would miss.
        """
        scales = config.MULTI_SCALE_GRIDS
        weights = config.MULTI_SCALE_WEIGHTS
        h, w = processed.shape[:2]

        # Run detection at each scale
        scale_results: list[list[dict]] = []
        for (sr, sc) in scales:
            cells = grid_engine.create_grid(processed, rows=sr, cols=sc)
            obj_signals = self._compute_combined_cell_signals(
                cells, cv_objects, ml_detections or []
            )
            cells = detector.score_all_cells(cells, cfg, color_stats, obj_signals)
            scale_results.append(cells)

        # Use the middle scale (5×5) as the primary grid
        primary_idx = 1
        primary_cells = scale_results[primary_idx]
        pr, pc = scales[primary_idx]

        # For each primary cell, blend scores from overlapping cells at other scales
        for cell in primary_cells:
            cx1, cy1, cx2, cy2 = cell["bbox"]
            cell_cx = (cx1 + cx2) / 2
            cell_cy = (cy1 + cy2) / 2

            blended_score = weights[primary_idx] * cell["result"]["anomaly_score"]
            blended_trash = weights[primary_idx] * (1.0 if cell["result"]["is_trash"] else 0.0)

            for si, (sr, sc) in enumerate(scales):
                if si == primary_idx:
                    continue
                # Find the cell at this scale that contains the primary cell's center
                for other_cell in scale_results[si]:
                    ox1, oy1, ox2, oy2 = other_cell["bbox"]
                    if ox1 <= cell_cx <= ox2 and oy1 <= cell_cy <= oy2:
                        blended_score += weights[si] * other_cell["result"]["anomaly_score"]
                        blended_trash += weights[si] * (1.0 if other_cell["result"]["is_trash"] else 0.0)
                        break

            cell["result"]["anomaly_score"] = round(min(blended_score, 1.0), 4)
            cell["result"]["is_trash"] = blended_trash >= 0.5

        return primary_cells, pr, pc

    @staticmethod
    def _decode(data: bytes) -> CvImage:
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image — unsupported or corrupt file")
        return img

    # ── Visualisation — Annotated ─────────────────────────────────
    def _draw_annotated(
        self,
        image: CvImage,
        cells: list[dict],
        summary: dict[str, Any],
        objects: list[objdet.DetectedObject] | None = None,
    ) -> CvImage:
        h, w = image.shape[:2]
        overlay = image.copy()
        output  = image.copy()

        for cell in cells:
            x1, y1, x2, y2 = cell["bbox"]
            r = cell["result"]
            score = r["anomaly_score"]
            if r["is_trash"]:
                alpha_fill = int(40 + score * 60)
                red_overlay = overlay.copy()
                cv2.rectangle(red_overlay, (x1, y1), (x2, y2), (0, 50, 220), -1)
                cv2.addWeighted(red_overlay, alpha_fill / 255, overlay, 1 - alpha_fill / 255, 0, overlay)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 100, 255), 2, cv2.LINE_AA)
            else:
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (70, 190, 70), 1, cv2.LINE_AA)

        cv2.addWeighted(overlay, 0.45, output, 0.55, 0, output)

        # ── Draw object bounding boxes ──────────────────────────
        if objects:
            for obj in objects:
                ox1, oy1, ox2, oy2 = obj.bbox
                # Category-specific colors
                cat_colors = {
                    "bottle": (0, 200, 255),   # cyan
                    "bag":    (255, 100, 255),  # magenta
                    "can":    (0, 255, 200),    # teal
                    "debris": (100, 180, 255),  # light blue
                    "unknown": (180, 180, 180), # gray
                }
                color = cat_colors.get(obj.category, (180, 180, 180))

                cv2.rectangle(output, (ox1, oy1), (ox2, oy2), color, 2, cv2.LINE_AA)

                # Label background
                label = f"{obj.category} {int(obj.confidence * 100)}%"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(output, (ox1, oy1 - th - 8), (ox1 + tw + 8, oy1), color, -1)
                cv2.putText(output, label, (ox1 + 4, oy1 - 4),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

        # ── Text overlay via PIL ────────────────────────────────
        pil = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB)).convert("RGBA")
        txt_layer = Image.new("RGBA", pil.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(txt_layer)

        try:
            f_title = ImageFont.truetype("arial.ttf", max(16, w // 55))
            f_label = ImageFont.truetype("arial.ttf", max(12, w // 75))
            f_small = ImageFont.truetype("arial.ttf", max(10, w // 90))
        except OSError:
            f_title = f_label = f_small = ImageFont.load_default()

        banner_h = max(44, h // 14)
        draw.rectangle([(0, 0), (w, banner_h)], fill=(8, 12, 28, 220))

        draw.text((14, banner_h // 2), "AQUASCAN", fill=(14, 165, 233, 255),
                  font=f_title, anchor="lm")

        d = summary["trash_density_pct"]
        d_col = (239, 68, 68, 255) if d > 30 else (250, 204, 21, 255) if d > 10 else (34, 197, 94, 255)
        draw.text((w // 2, banner_h // 2), f"Debris Density: {d}%",
                  fill=d_col, font=f_title, anchor="mm")

        obj_count = summary.get("objects_detected", 0)
        right_text = f"Flagged: {summary['trash_cells']}  |  Objects: {obj_count}"
        draw.text((w - 14, banner_h // 2), right_text,
                  fill=(180, 180, 190, 255), font=f_small, anchor="rm")

        # Cell badges
        for cell in cells:
            x1, y1, x2, y2 = cell["bbox"]
            r = cell["result"]
            cx = x1 + (x2 - x1) // 2
            cy = y1 + (y2 - y1) // 2

            badge_txt = f"{int(r['anomaly_score'] * 100)}%"
            bbox = draw.textbbox((0, 0), badge_txt, font=f_label)
            bw = bbox[2] - bbox[0] + 14
            bh = bbox[3] - bbox[1] + 8
            rx, ry = cx - bw // 2, cy - bh // 2

            badge_col = (220, 40, 40, 180) if r["is_trash"] else (30, 160, 60, 140)
            draw.rounded_rectangle([(rx, ry), (rx + bw, ry + bh)],
                                   radius=bh // 2, fill=badge_col)
            draw.text((cx, cy), badge_txt, fill=(255, 255, 255, 240),
                      font=f_label, anchor="mm")

            # Check dots (now 6 checks)
            check_list = [r["check_a"], r["check_b"], r["check_c"],
                          r.get("check_d", False), r.get("check_e", False),
                          r.get("check_f", False)]
            dot_y = y2 - 10
            dot_start = cx - 17
            for ci, passed in enumerate(check_list):
                dot_col = (239, 68, 68, 200) if passed else (100, 100, 100, 120)
                dx = dot_start + ci * 6
                draw.ellipse([(dx, dot_y), (dx + 4, dot_y + 4)], fill=dot_col)

        merged = Image.alpha_composite(pil, txt_layer).convert("RGB")
        return cv2.cvtColor(np.array(merged), cv2.COLOR_RGB2BGR)

    # ── Visualisation — Heatmap ──────────────────────────────────
    def _draw_heatmap(
        self,
        cells: list[dict],
        rows: int,
        cols: int,
        img_shape: tuple[int, ...],
    ) -> CvImage:
        h, w = img_shape[:2]

        grid = np.zeros((rows, cols), dtype=np.float32)
        for c in cells:
            grid[c["row"], c["col"]] = c["result"]["anomaly_score"]

        heat_u8 = (grid * 255).astype(np.uint8)
        heat_big = cv2.resize(heat_u8, (w, h), interpolation=cv2.INTER_LINEAR)
        heat_big = cv2.GaussianBlur(heat_big, (0, 0), sigmaX=w / cols * 0.4)
        heatmap = cv2.applyColorMap(heat_big, cv2.COLORMAP_INFERNO)

        cell_h, cell_w = h // rows, w // cols
        for r in range(1, rows):
            y = r * cell_h
            cv2.line(heatmap, (0, y), (w, y), (255, 255, 255), 1, cv2.LINE_AA)
        for c_idx in range(1, cols):
            x = c_idx * cell_w
            cv2.line(heatmap, (x, 0), (x, h), (255, 255, 255), 1, cv2.LINE_AA)

        pil = Image.fromarray(cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)).convert("RGBA")
        txt_layer = Image.new("RGBA", pil.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(txt_layer)

        try:
            f_val = ImageFont.truetype("arial.ttf", max(14, w // 60))
            f_hdr = ImageFont.truetype("arial.ttf", max(16, w // 50))
        except OSError:
            f_val = f_hdr = ImageFont.load_default()

        for cell in cells:
            r_idx, c_idx = cell["row"], cell["col"]
            cx = c_idx * cell_w + cell_w // 2
            cy = r_idx * cell_h + cell_h // 2
            val = cell["result"]["anomaly_score"]
            txt = f"{int(val * 100)}%"
            draw.text((cx + 1, cy + 1), txt, fill=(0, 0, 0, 180), font=f_val, anchor="mm")
            draw.text((cx, cy), txt, fill=(255, 255, 255, 230), font=f_val, anchor="mm")

        draw.rectangle([(0, 0), (w, 36)], fill=(8, 12, 28, 200))
        draw.text((14, 18), "ANOMALY HEATMAP", fill=(14, 165, 233, 255),
                  font=f_hdr, anchor="lm")

        merged = Image.alpha_composite(pil, txt_layer).convert("RGB")
        return cv2.cvtColor(np.array(merged), cv2.COLOR_RGB2BGR)

    @staticmethod
    def _encode(img: CvImage, quality: int = 92) -> str:
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return "data:image/jpeg;base64," + base64.b64encode(buf).decode()
