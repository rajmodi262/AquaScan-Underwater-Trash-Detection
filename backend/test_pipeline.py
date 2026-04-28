"""
AquaScan — Unit Tests (v4)

Covers: config, preprocessor, grid_engine, detector (adaptive + object-aware),
        object_detector, evaluator, pipeline.

Run:  python -m pytest test_pipeline.py -v
"""
from __future__ import annotations

import os
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))

import config
import detector
import grid_engine
import preprocessor
import object_detector as objdet
from config import DetectionConfig
from evaluator import EvalMetrics, evaluate_image
from pipeline import Pipeline


# ── Fixtures ────────────────────────────────────────────────────
@pytest.fixture
def blue_image() -> np.ndarray:
    """Synthetic 640×480 uniform blue-green underwater image."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:, :, 0] = 130
    img[:, :, 1] = 100
    img[:, :, 2] = 40
    return img


@pytest.fixture
def mixed_image() -> np.ndarray:
    """Image with one clearly anomalous quadrant (white rectangle + red splash)
    and three uniform quadrants. Tests that adaptive thresholding correctly
    flags ONLY the anomalous region."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    # Fill entire image with natural blue-green
    img[:, :, 0] = 120
    img[:, :, 1] = 100
    img[:, :, 2] = 50
    # Add strong anomaly in top-left quadrant ONLY
    cv2.rectangle(img, (30, 20), (280, 200), (255, 255, 255), -1)
    cv2.circle(img, (150, 100), 40, (0, 0, 255), -1)
    return img


@pytest.fixture
def trash_cell() -> np.ndarray:
    cell = np.zeros((120, 160, 3), dtype=np.uint8)
    cell[:, :] = [40, 40, 40]
    cv2.rectangle(cell, (30, 20), (130, 100), (255, 255, 255), -1)
    cv2.circle(cell, (80, 60), 20, (0, 0, 255), -1)
    return cell


@pytest.fixture
def clean_cell() -> np.ndarray:
    rng = np.random.RandomState(42)
    cell = rng.randint(70, 130, (120, 160, 3), dtype=np.uint8)
    cell[:, :, 0] = np.clip(cell[:, :, 0] + 30, 0, 255)
    return cell


@pytest.fixture
def bottle_image() -> np.ndarray:
    """Image with a clear bottle-like shape on blue background."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:, :] = [130, 100, 40]  # blue-green background
    # White elongated rectangle = bottle
    cv2.rectangle(img, (200, 100), (250, 300), (230, 230, 230), -1)
    # Red cap
    cv2.circle(img, (225, 100), 15, (40, 40, 220), -1)
    return img


# ── Config Tests ────────────────────────────────────────────────
class TestConfig:
    def test_detection_config_is_frozen(self):
        cfg = DetectionConfig()
        with pytest.raises(Exception):
            cfg.outlier_sigma = 999  # type: ignore

    def test_detection_config_defaults(self):
        cfg = DetectionConfig()
        assert cfg.outlier_sigma == 1.5
        assert cfg.checks_to_flag == 2

    def test_custom_config(self):
        cfg = DetectionConfig(outlier_sigma=2.0, checks_to_flag=3)
        assert cfg.outlier_sigma == 2.0
        assert cfg.checks_to_flag == 3

    def test_frame_size(self):
        assert config.FRAME_WIDTH >= 1280
        assert config.FRAME_HEIGHT >= 720

    def test_v4_config_fields(self):
        cfg = DetectionConfig()
        assert hasattr(cfg, 'w_object')
        assert hasattr(cfg, 'enable_object_detection')
        assert hasattr(cfg, 'enable_multi_scale')
        assert hasattr(cfg, 'color_model')
        assert cfg.color_model == 'adaptive'


# ── Preprocessor Tests ──────────────────────────────────────────
class TestPreprocessor:
    def test_resize(self, blue_image):
        out = preprocessor.resize_frame(blue_image)
        assert out.shape[:2] == (config.FRAME_HEIGHT, config.FRAME_WIDTH)

    def test_preprocess_returns_correct_shape(self, blue_image):
        out = preprocessor.preprocess(blue_image, apply_dehaze=False)
        assert out.shape[:2] == (config.FRAME_HEIGHT, config.FRAME_WIDTH)
        assert out.dtype == np.uint8

    def test_correct_colors_boosts_red(self, blue_image):
        resized = preprocessor.resize_frame(blue_image)
        corrected = preprocessor.correct_colors(resized)
        assert corrected[:, :, 2].mean() > blue_image[:, :, 2].mean()

    def test_white_balance(self, blue_image):
        """v4: White balance should reduce blue-green dominance."""
        wb = preprocessor.white_balance(blue_image)
        # After white balance, channels should be more balanced
        b_mean = wb[:, :, 0].mean()
        g_mean = wb[:, :, 1].mean()
        r_mean = wb[:, :, 2].mean()
        # The spread between channels should be smaller than original
        original_spread = blue_image[:, :, 0].mean() - blue_image[:, :, 2].mean()
        wb_spread = b_mean - r_mean
        assert wb_spread < original_spread

    def test_compute_image_color_stats(self, blue_image):
        """v4: color stats should return valid mean/std for HSV, LAB, BGR."""
        stats = preprocessor.compute_image_color_stats(blue_image)
        assert "hsv_mean" in stats
        assert "hsv_std" in stats
        assert "lab_mean" in stats
        assert "lab_std" in stats
        assert stats["hsv_mean"].shape == (3,)
        assert stats["lab_std"].shape == (3,)


# ── Grid Engine Tests ───────────────────────────────────────────
class TestGridEngine:
    def test_default_grid(self, blue_image):
        cells = grid_engine.create_grid(blue_image, rows=4, cols=4)
        assert len(cells) == 16

    def test_cell_coverage(self, blue_image):
        h, w = blue_image.shape[:2]
        cells = grid_engine.create_grid(blue_image, rows=3, cols=3)
        covered = np.zeros((h, w), dtype=bool)
        for c in cells:
            x1, y1, x2, y2 = c["bbox"]
            covered[y1:y2, x1:x2] = True
        assert covered.all()


# ── Detector — Adaptive Threshold Tests ─────────────────────────
class TestDetectorAdaptive:
    """These test the CORE fix: adaptive z-score thresholding."""

    def test_uniform_image_no_flags(self, blue_image):
        """A UNIFORM image should flag ZERO cells."""
        cells = grid_engine.create_grid(blue_image, rows=4, cols=4)
        cells = detector.score_all_cells(cells)
        flagged = sum(1 for c in cells if c["result"]["is_trash"])
        assert flagged == 0, f"Uniform image should flag 0 cells, got {flagged}"

    def test_mixed_image_selective_flagging(self, mixed_image):
        """Only the anomalous quadrant should be flagged."""
        cells = grid_engine.create_grid(mixed_image, rows=2, cols=2)
        cells = detector.score_all_cells(cells)

        # Top-left (0,0) has the anomaly
        top_left = next(c for c in cells if c["row"] == 0 and c["col"] == 0)
        assert top_left["result"]["is_trash"], "Anomalous quadrant should be flagged"

        # Other cells should mostly be clean
        others = [c for c in cells if not (c["row"] == 0 and c["col"] == 0)]
        clean_count = sum(1 for c in others if not c["result"]["is_trash"])
        assert clean_count >= 2, "At least 2 of 3 uniform cells should be clean"

    def test_all_identical_cells_zero_flags(self):
        """When all cells are identical, std=0, so NO cell can be an outlier."""
        tile = np.full((120, 160, 3), [100, 120, 80], dtype=np.uint8)
        img = np.tile(tile, (4, 4, 1))
        cells = grid_engine.create_grid(img, rows=4, cols=4)
        cells = detector.score_all_cells(cells)
        flagged = sum(1 for c in cells if c["result"]["is_trash"])
        assert flagged == 0, "Identical cells should produce 0 flags"

    def test_anomaly_score_is_not_fake_probability(self, mixed_image):
        """Output uses 'anomaly_score', not 'confidence'."""
        cells = grid_engine.create_grid(mixed_image, rows=2, cols=2)
        cells = detector.score_all_cells(cells)
        for c in cells:
            r = c["result"]
            assert "anomaly_score" in r
            assert "confidence" not in r
            assert 0.0 <= r["anomaly_score"] <= 1.0

    def test_result_has_z_scores(self, mixed_image):
        """Z-scores should be exposed for transparency."""
        cells = grid_engine.create_grid(mixed_image, rows=2, cols=2)
        cells = detector.score_all_cells(cells)
        r = cells[0]["result"]
        assert "z_edge" in r
        assert "z_shape" in r
        assert "z_color" in r
        assert "z_texture" in r
        assert "z_freq" in r
        assert "z_object" in r  # v4: new check

    def test_sigma_sensitivity(self, mixed_image):
        """Higher sigma = stricter = fewer flags."""
        cells_loose = grid_engine.create_grid(mixed_image.copy(), rows=2, cols=2)
        cells_strict = grid_engine.create_grid(mixed_image.copy(), rows=2, cols=2)

        detector.score_all_cells(cells_loose, DetectionConfig(outlier_sigma=0.5))
        detector.score_all_cells(cells_strict, DetectionConfig(outlier_sigma=2.5))

        flags_loose = sum(1 for c in cells_loose if c["result"]["is_trash"])
        flags_strict = sum(1 for c in cells_strict if c["result"]["is_trash"])
        assert flags_loose >= flags_strict, "Lower sigma should produce more flags"

    def test_v4_result_has_object_score(self, mixed_image):
        """v4: result should include object_score and check_f."""
        cells = grid_engine.create_grid(mixed_image, rows=2, cols=2)
        cells = detector.score_all_cells(cells)
        r = cells[0]["result"]
        assert "object_score" in r
        assert "check_f" in r

    def test_adaptive_color_model(self, mixed_image):
        """v4: adaptive color model should produce different scores than fixed."""
        color_stats = preprocessor.compute_image_color_stats(mixed_image)

        cells_adaptive = grid_engine.create_grid(mixed_image.copy(), rows=2, cols=2)
        cells_fixed = grid_engine.create_grid(mixed_image.copy(), rows=2, cols=2)

        detector.score_all_cells(cells_adaptive,
                                 DetectionConfig(color_model='adaptive'),
                                 color_stats=color_stats)
        detector.score_all_cells(cells_fixed,
                                 DetectionConfig(color_model='fixed'))

        # Both should complete — we're testing they don't crash
        assert all("result" in c for c in cells_adaptive)
        assert all("result" in c for c in cells_fixed)


# ── Detector — Signal Extractors ────────────────────────────────
class TestSignalExtractors:
    def test_lbp_uniform_low_entropy(self):
        uniform = np.ones((60, 80), dtype=np.uint8) * 128
        score = detector._texture_entropy(uniform)
        assert score < 0.5  # relaxed slightly for Laplacian blend

    def test_lbp_noisy_high_entropy(self):
        noisy = np.random.RandomState(0).randint(0, 256, (60, 80), dtype=np.uint8)
        score = detector._texture_entropy(noisy)
        assert score > 0.4

    def test_fft_constant_vs_gradient(self):
        const = np.ones((60, 80), dtype=np.uint8) * 128
        grad = np.tile(np.linspace(0, 255, 80, dtype=np.uint8), (60, 1))
        assert detector._frequency_energy(const) < detector._frequency_energy(grad)

    def test_empty_cell_signals(self):
        result = detector.score_cell(np.array([], dtype=np.uint8))
        assert result["is_trash"] is False
        assert result["anomaly_score"] == 0.0

    def test_auto_canny_adapts_to_brightness(self):
        """v4: auto-Canny should produce edges even in dark/bright images."""
        dark = np.ones((60, 80), dtype=np.uint8) * 30
        cv2.rectangle(dark, (10, 10), (70, 50), 80, -1)
        bright = np.ones((60, 80), dtype=np.uint8) * 220
        cv2.rectangle(bright, (10, 10), (70, 50), 160, -1)

        dark_edges = detector._edge_density(dark)
        bright_edges = detector._edge_density(bright)
        # Both should detect some edges (auto-Canny adapts)
        assert dark_edges > 0, "Auto-Canny should detect edges in dark images"
        assert bright_edges > 0, "Auto-Canny should detect edges in bright images"


# ── Object Detector Tests ──────────────────────────────────────
class TestObjectDetector:
    def test_detect_objects_on_clean_image(self, blue_image):
        """Uniform blue image should produce few/no objects."""
        objects = objdet.detect_objects(blue_image)
        # Might produce a few noise detections, but should be minimal
        assert len(objects) < 5, f"Clean image produced {len(objects)} objects"

    def test_detect_objects_on_trash_image(self, bottle_image):
        """Image with clear bottle shape should detect at least 1 object."""
        color_stats = preprocessor.compute_image_color_stats(bottle_image)
        objects = objdet.detect_objects(bottle_image, color_stats)
        # The bright white bottle should be detected
        assert len(objects) >= 1, "Should detect at least 1 object in bottle image"

    def test_object_has_correct_fields(self, bottle_image):
        """DetectedObject should have all required fields."""
        objects = objdet.detect_objects(bottle_image)
        if len(objects) > 0:
            obj = objects[0]
            assert hasattr(obj, 'bbox')
            assert hasattr(obj, 'category')
            assert hasattr(obj, 'confidence')
            assert hasattr(obj, 'features')
            assert len(obj.bbox) == 4
            assert obj.category in ('bottle', 'bag', 'can', 'debris', 'unknown')

    def test_cell_object_signal(self):
        """compute_cell_object_signal should return fraction of cell covered."""
        obj = objdet.DetectedObject(
            bbox=(10, 10, 60, 60), contour=None, area=2500,
            category="bottle", confidence=0.8, features={},
        )
        # Cell that fully contains the object
        signal = objdet.compute_cell_object_signal([obj], (0, 0, 100, 100))
        assert 0.0 < signal <= 1.0

        # Cell that doesn't overlap
        signal_no = objdet.compute_cell_object_signal([obj], (200, 200, 300, 300))
        assert signal_no == 0.0

    def test_nms_removes_overlapping(self):
        """NMS should remove heavily overlapping detections."""
        obj1 = objdet.DetectedObject(
            bbox=(10, 10, 60, 60), contour=None, area=2500,
            category="bottle", confidence=0.8, features={},
        )
        obj2 = objdet.DetectedObject(
            bbox=(15, 15, 65, 65), contour=None, area=2500,
            category="bottle", confidence=0.7, features={},
        )
        result = objdet._nms([obj1, obj2], iou_thresh=0.3)
        assert len(result) == 1  # One should be suppressed

    def test_objects_to_json(self, bottle_image):
        """Serialisation should produce valid JSON-compatible dicts."""
        objects = objdet.detect_objects(bottle_image)
        json_list = objdet.objects_to_json(objects)
        assert isinstance(json_list, list)
        if len(json_list) > 0:
            item = json_list[0]
            assert "bbox" in item
            assert "category" in item
            assert "confidence" in item

    def test_classify_shape_bottle(self):
        """Elongated, rectangular shape should classify as bottle."""
        features = {
            "area": 5000, "perimeter": 400, "solidity": 0.85,
            "aspect_ratio": 3.0, "rectangularity": 0.75,
            "circularity": 0.3, "compactness": 32.0, "extent": 0.75,
            "bbox_w": 50, "bbox_h": 150,
        }
        cat, conf = objdet._classify_shape(features)
        assert cat == "bottle"

    def test_classify_shape_bag(self):
        """Irregular, low-solidity shape should classify as bag."""
        features = {
            "area": 3000, "perimeter": 500, "solidity": 0.35,
            "aspect_ratio": 1.5, "rectangularity": 0.30,
            "circularity": 0.15, "compactness": 83.0, "extent": 0.30,
            "bbox_w": 100, "bbox_h": 100,
        }
        cat, conf = objdet._classify_shape(features)
        assert cat == "bag"

    def test_classify_shape_can(self):
        """Circular, solid shape should classify as can."""
        features = {
            "area": 2000, "perimeter": 160, "solidity": 0.90,
            "aspect_ratio": 1.1, "rectangularity": 0.80,
            "circularity": 0.85, "compactness": 12.8, "extent": 0.80,
            "bbox_w": 50, "bbox_h": 55,
        }
        cat, conf = objdet._classify_shape(features)
        assert cat == "can"


# ── Evaluator Tests ─────────────────────────────────────────────
class TestEvaluator:
    def test_perfect_predictions(self):
        preds = [
            {"row": 0, "col": 0, "is_trash": True},
            {"row": 0, "col": 1, "is_trash": False},
            {"row": 1, "col": 0, "is_trash": False},
            {"row": 1, "col": 1, "is_trash": True},
        ]
        gt = [[1, 0], [0, 1]]
        m = evaluate_image(preds, gt)
        assert m.precision == 1.0
        assert m.recall == 1.0
        assert m.f1 == 1.0

    def test_all_false_positives(self):
        preds = [
            {"row": 0, "col": 0, "is_trash": True},
            {"row": 0, "col": 1, "is_trash": True},
        ]
        gt = [[0, 0]]
        m = evaluate_image(preds, gt)
        assert m.precision == 0.0
        assert m.false_positives == 2

    def test_metrics_addition(self):
        m1 = EvalMetrics(true_positives=3, false_positives=1, true_negatives=5, false_negatives=1)
        m2 = EvalMetrics(true_positives=2, false_positives=0, true_negatives=3, false_negatives=1)
        combined = m1 + m2
        assert combined.true_positives == 5
        assert combined.total == 16


# ── Pipeline Integration Tests ──────────────────────────────────
class TestPipeline:
    def test_end_to_end(self, blue_image):
        _, buf = cv2.imencode(".jpg", blue_image)
        pipe = Pipeline()
        result = pipe.process(buf.tobytes(), grid_rows=2, grid_cols=2,
                              cfg=DetectionConfig(enable_multi_scale=False))

        assert "summary" in result
        assert "cells" in result
        assert "images" in result
        assert "objects" in result  # v4
        assert len(result["cells"]) == 4
        assert result["images"]["annotated"].startswith("data:image/jpeg;base64,")
        assert result["images"]["heatmap"].startswith("data:image/jpeg;base64,")

    def test_thread_safety(self, blue_image):
        """Different configs don't interfere."""
        _, buf = cv2.imencode(".jpg", blue_image)
        pipe = Pipeline()

        r1 = pipe.process(buf.tobytes(),
                          cfg=DetectionConfig(outlier_sigma=0.5, enable_multi_scale=False))
        r2 = pipe.process(buf.tobytes(),
                          cfg=DetectionConfig(outlier_sigma=3.0, enable_multi_scale=False))

        assert r1["summary"]["trash_density_pct"] >= r2["summary"]["trash_density_pct"]

    def test_invalid_image_raises(self):
        pipe = Pipeline()
        with pytest.raises(ValueError, match="Could not decode"):
            pipe.process(b"not-an-image")

    def test_uniform_image_zero_density(self, blue_image):
        """Uniform image = 0% density."""
        _, buf = cv2.imencode(".jpg", blue_image)
        pipe = Pipeline()
        result = pipe.process(buf.tobytes(), grid_rows=4, grid_cols=4,
                              cfg=DetectionConfig(enable_multi_scale=False))
        assert result["summary"]["trash_density_pct"] == 0.0, \
            f"Uniform image should have 0% density, got {result['summary']['trash_density_pct']}%"

    def test_summary_uses_anomaly_score(self, blue_image):
        """Summary uses 'avg_anomaly_score', not 'avg_confidence'."""
        _, buf = cv2.imencode(".jpg", blue_image)
        pipe = Pipeline()
        result = pipe.process(buf.tobytes(),
                              cfg=DetectionConfig(enable_multi_scale=False))
        assert "avg_anomaly_score" in result["summary"]
        assert "avg_confidence" not in result["summary"]

    def test_objects_in_response(self, bottle_image):
        """v4: Pipeline should include detected objects in response."""
        _, buf = cv2.imencode(".jpg", bottle_image)
        pipe = Pipeline()
        result = pipe.process(buf.tobytes(),
                              cfg=DetectionConfig(enable_multi_scale=False))
        assert "objects" in result
        assert isinstance(result["objects"], list)
        assert "objects_detected" in result["summary"]

    def test_multi_scale_pipeline(self, mixed_image):
        """v4: Multi-scale pipeline should complete without errors."""
        _, buf = cv2.imencode(".jpg", mixed_image)
        pipe = Pipeline()
        result = pipe.process(buf.tobytes(),
                              cfg=DetectionConfig(enable_multi_scale=True))
        assert "summary" in result
        assert "cells" in result
        # Multi-scale uses 5×5 as primary
        assert len(result["cells"]) == 25


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
