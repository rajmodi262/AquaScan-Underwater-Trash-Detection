"""
AquaScan — Evaluator (v3)

Computes precision, recall, F1, and per-class metrics against
ground-truth annotations.

Ground truth format (JSON):
  {
    "image": "test1.jpg",
    "grid_rows": 4,
    "grid_cols": 4,
    "labels": [[1,0,0,1], [0,0,1,0], [0,0,0,0], [1,0,0,0]]
  }
  where 1 = trash, 0 = clean.

Usage:
  python evaluator.py --annotations data/annotations/
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class EvalMetrics:
    """Per-image or aggregate evaluation metrics."""
    true_positives:  int = 0
    false_positives: int = 0
    true_negatives:  int = 0
    false_negatives: int = 0

    @property
    def precision(self) -> float:
        denom = self.true_positives + self.false_positives
        return self.true_positives / denom if denom > 0 else 0.0

    @property
    def recall(self) -> float:
        denom = self.true_positives + self.false_negatives
        return self.true_positives / denom if denom > 0 else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0

    @property
    def accuracy(self) -> float:
        total = self.true_positives + self.false_positives + self.true_negatives + self.false_negatives
        return (self.true_positives + self.true_negatives) / total if total > 0 else 0.0

    @property
    def total(self) -> int:
        return self.true_positives + self.false_positives + self.true_negatives + self.false_negatives

    def to_dict(self) -> dict[str, Any]:
        return {
            "precision":       round(self.precision, 4),
            "recall":          round(self.recall, 4),
            "f1":              round(self.f1, 4),
            "accuracy":        round(self.accuracy, 4),
            "true_positives":  self.true_positives,
            "false_positives": self.false_positives,
            "true_negatives":  self.true_negatives,
            "false_negatives": self.false_negatives,
            "total_cells":     self.total,
        }

    def __add__(self, other: EvalMetrics) -> EvalMetrics:
        return EvalMetrics(
            true_positives=self.true_positives + other.true_positives,
            false_positives=self.false_positives + other.false_positives,
            true_negatives=self.true_negatives + other.true_negatives,
            false_negatives=self.false_negatives + other.false_negatives,
        )


def evaluate_image(
    predictions: list[dict[str, Any]],
    ground_truth: list[list[int]],
) -> EvalMetrics:
    """Compare predicted cell results against ground truth labels.

    Args:
        predictions: list of cell dicts from detector (must have 'row', 'col', 'is_trash').
        ground_truth: 2D list of 0/1 labels (rows × cols).

    Returns:
        EvalMetrics for this image.
    """
    metrics = EvalMetrics()
    for cell in predictions:
        row, col = cell["row"], cell["col"]
        if row >= len(ground_truth) or col >= len(ground_truth[row]):
            logger.warning("Cell (%d,%d) out of ground truth bounds", row, col)
            continue

        predicted = cell.get("is_trash", False)
        actual = bool(ground_truth[row][col])

        if predicted and actual:
            metrics.true_positives += 1
        elif predicted and not actual:
            metrics.false_positives += 1
        elif not predicted and actual:
            metrics.false_negatives += 1
        else:
            metrics.true_negatives += 1

    return metrics


def evaluate_batch(
    results: list[tuple[list[dict], list[list[int]]]],
) -> dict[str, Any]:
    """Evaluate a batch of (predictions, ground_truth) pairs.

    Returns aggregate metrics and per-image breakdown.
    """
    aggregate = EvalMetrics()
    per_image: list[dict[str, Any]] = []

    for i, (preds, gt) in enumerate(results):
        img_metrics = evaluate_image(preds, gt)
        aggregate = aggregate + img_metrics
        per_image.append({
            "image_index": i,
            **img_metrics.to_dict(),
        })

    return {
        "aggregate": aggregate.to_dict(),
        "per_image": per_image,
    }


def load_annotations(annotation_dir: str) -> list[dict[str, Any]]:
    """Load all JSON annotation files from a directory."""
    annotations: list[dict[str, Any]] = []
    if not os.path.isdir(annotation_dir):
        logger.warning("Annotation directory not found: %s", annotation_dir)
        return annotations

    for fname in sorted(os.listdir(annotation_dir)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(annotation_dir, fname)
        try:
            with open(path, "r") as f:
                data = json.load(f)
            annotations.append(data)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load annotation %s: %s", fname, exc)

    return annotations


# ── CLI entry point ─────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    import sys

    import cv2

    sys.path.insert(0, os.path.dirname(__file__))
    from config import DetectionConfig
    from pipeline import Pipeline

    parser = argparse.ArgumentParser(description="Evaluate AquaScan detector against ground truth.")
    parser.add_argument("--annotations", type=str, default="data/annotations/",
                        help="Directory containing ground truth JSON files.")
    parser.add_argument("--samples", type=str, default="data/sample_images/",
                        help="Directory containing sample images.")
    parser.add_argument("--sigma", type=float, default=1.5,
                        help="Outlier sigma threshold.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    annots = load_annotations(args.annotations)
    if not annots:
        print("No annotations found. Create JSON files in", args.annotations)
        print("Format: {\"image\": \"name.jpg\", \"grid_rows\": 4, \"grid_cols\": 4,")
        print("         \"labels\": [[0,0,1,0], [0,0,0,0], [1,0,0,1], [0,0,0,0]]}")
        sys.exit(1)

    pipe = Pipeline()
    cfg = DetectionConfig(outlier_sigma=args.sigma)
    batch: list[tuple[list[dict], list[list[int]]]] = []

    for annot in annots:
        img_path = os.path.join(args.samples, annot["image"])
        if not os.path.isfile(img_path):
            logger.warning("Image not found: %s", img_path)
            continue

        with open(img_path, "rb") as f:
            image_bytes = f.read()

        result = pipe.process(
            image_bytes,
            grid_rows=annot.get("grid_rows", 4),
            grid_cols=annot.get("grid_cols", 4),
            cfg=cfg,
        )
        batch.append((result["cells"], annot["labels"]))

    if not batch:
        print("No images could be evaluated.")
        sys.exit(1)

    report = evaluate_batch(batch)
    print("\n" + "=" * 50)
    print("AQUASCAN EVALUATION REPORT")
    print("=" * 50)
    agg = report["aggregate"]
    print(f"  Images evaluated: {len(batch)}")
    print(f"  Total cells:      {agg['total_cells']}")
    print(f"  Precision:        {agg['precision']:.3f}")
    print(f"  Recall:           {agg['recall']:.3f}")
    print(f"  F1 Score:         {agg['f1']:.3f}")
    print(f"  Accuracy:         {agg['accuracy']:.3f}")
    print(f"  TP={agg['true_positives']} FP={agg['false_positives']} "
          f"TN={agg['true_negatives']} FN={agg['false_negatives']}")
    print("=" * 50)
