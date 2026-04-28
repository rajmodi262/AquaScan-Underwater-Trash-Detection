"""
AquaScan — CLI Tool (v3)

Command-line interface for processing images and videos.
Uses the v3 adaptive z-score detection pipeline.

USAGE:
  # Single image
  python cli.py --input ../data/sample_images/test.jpg

  # Video file (process every 3rd frame)
  python cli.py --input ../data/sample_images/clip.mp4 --every 3

  # With ground-truth accuracy check
  python cli.py --input ../data/sample_images/test.jpg \
                --annotations ../data/annotations/test.json

  # Custom grid + sensitivity
  python cli.py --input ../data/sample_images/test.jpg --grid 6x6 --sigma 2.0

  # Show live window while processing
  python cli.py --input ../data/sample_images/test.jpg --show
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import cv2
import numpy as np

# Ensure backend modules are importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import preprocessor
import grid_engine
import detector
from config import DetectionConfig
from pipeline import Pipeline


# ---------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------
def is_video(path: str) -> bool:
    ext = os.path.splitext(path)[1].lower()
    return ext in {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def parse_grid(grid_str: str) -> tuple[int, int]:
    """Parse '4x4' into (4, 4)."""
    try:
        rows, cols = grid_str.lower().split("x")
        return int(rows), int(cols)
    except Exception:
        print(f"[ERROR] Invalid --grid value '{grid_str}'. Use format like 4x4")
        sys.exit(1)


def ensure_dirs():
    for d in [config.OUTPUT_DIR, config.SAMPLE_DIR, config.ANNOTATION_DIR]:
        os.makedirs(d, exist_ok=True)


# ---------------------------------------------------------------
#  Process a single image
# ---------------------------------------------------------------
def process_image(path: str, rows: int, cols: int, cfg: DetectionConfig,
                  annotation_path: str | None = None, show: bool = False):
    print(f"\n[cli] Processing image: {path}")

    src = cv2.imread(path)
    if src is None:
        print(f"[ERROR] Cannot read image: {path}")
        return

    t0 = time.time()

    # Pipeline
    processed = preprocessor.preprocess(src, apply_dehaze=cfg.dehaze)
    cells = grid_engine.create_grid(processed, rows=rows, cols=cols)
    cells = detector.score_all_cells(cells, cfg)
    summary = detector.frame_summary(cells)

    # Draw annotated + heatmap using pipeline visualisation
    pipe = Pipeline()
    annotated = pipe._draw_annotated(processed, cells, summary)
    heatmap = pipe._draw_heatmap(cells, rows, cols, processed.shape)

    elapsed = round(time.time() - t0, 2)

    # Save outputs
    base_name = os.path.splitext(os.path.basename(path))[0]
    main_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_annotated.jpg")
    heat_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_heatmap.jpg")
    cv2.imwrite(main_path, annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(heat_path, heatmap, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # Print summary
    print(f"  Grid             : {rows}x{cols}")
    print(f"  Flagged cells    : {summary['trash_cells']} / {summary['total_cells']}")
    print(f"  Debris density   : {summary['trash_density_pct']}%")
    print(f"  Avg anomaly score: {summary['avg_anomaly_score']}")
    print(f"  Outlier sigma    : {cfg.outlier_sigma}")
    print(f"  Time             : {elapsed}s")
    print(f"  Saved → {main_path}")
    print(f"  Saved → {heat_path}")

    # Accuracy metrics if annotations provided
    if annotation_path:
        if not os.path.exists(annotation_path):
            print(f"[WARN] Annotation file not found: {annotation_path}")
        else:
            import json
            from evaluator import evaluate_image, EvalMetrics

            with open(annotation_path, "r") as f:
                annot = json.load(f)

            gt_labels = annot.get("labels", [])
            pred_cells = []
            for c in cells:
                pred_cells.append({
                    "row": c["row"], "col": c["col"],
                    "is_trash": c["result"]["is_trash"],
                })

            metrics = evaluate_image(pred_cells, gt_labels)
            print(f"\n  {'=' * 40}")
            print(f"  ACCURACY METRICS")
            print(f"  {'=' * 40}")
            print(f"  Precision : {metrics.precision:.1%}")
            print(f"  Recall    : {metrics.recall:.1%}")
            print(f"  F1 Score  : {metrics.f1:.1%}")
            print(f"  Accuracy  : {metrics.accuracy:.1%}")
            print(f"  TP={metrics.true_positives} FP={metrics.false_positives} "
                  f"TN={metrics.true_negatives} FN={metrics.false_negatives}")
            print(f"  {'=' * 40}")

    if show:
        cv2.imshow("Annotated Result", annotated)
        cv2.imshow("Anomaly Heatmap", heatmap)
        print("\n[cli] Press any key to close windows...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()

    return summary


# ---------------------------------------------------------------
#  Process a video file
# ---------------------------------------------------------------
def process_video(path: str, rows: int, cols: int, cfg: DetectionConfig,
                  every_n: int = 3, show: bool = False):
    print(f"\n[cli] Processing video: {path}")

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {path}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    base_name = os.path.splitext(os.path.basename(path))[0]

    print(f"  Total frames: {total_frames}  FPS: {fps:.1f}  "
          f"Processing every {every_n}th frame")

    frame_results = []
    frame_idx = 0
    processed_count = 0

    # Video writer for annotated output
    out_video_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_annotated.mp4")
    writer = None
    pipe = Pipeline()

    t0 = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % every_n != 0:
            continue

        processed_count += 1

        # Pipeline
        proc = preprocessor.preprocess(frame, apply_dehaze=cfg.dehaze)
        cells = grid_engine.create_grid(proc, rows=rows, cols=cols)
        cells = detector.score_all_cells(cells, cfg)
        summary = detector.frame_summary(cells)
        annotated = pipe._draw_annotated(proc, cells, summary)

        # Init video writer on first frame
        if writer is None:
            h, w = annotated.shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(out_video_path, fourcc, fps / every_n, (w, h))

        writer.write(annotated)

        # Progress
        pct = round(frame_idx / total_frames * 100, 1) if total_frames > 0 else "?"
        print(f"  Frame {frame_idx:>5}/{total_frames}  ({pct}%)  "
              f"Density: {summary['trash_density_pct']}%", end="\r")

        frame_results.append({
            "filename":          f"frame_{frame_idx:05d}",
            "total_cells":       summary["total_cells"],
            "trash_cells":       summary["trash_cells"],
            "clean_cells":       summary["clean_cells"],
            "trash_density_pct": summary["trash_density_pct"],
            "avg_anomaly_score": summary["avg_anomaly_score"],
        })

        if show:
            cv2.imshow("Processing...", annotated)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("\n[cli] Stopped by user.")
                break

    cap.release()
    if writer:
        writer.release()
    if show:
        cv2.destroyAllWindows()

    elapsed = round(time.time() - t0, 1)
    print(f"\n\n[cli] Done — {processed_count} frames in {elapsed}s")
    print(f"  Output video → {out_video_path}")

    # Save CSV log
    if frame_results:
        import csv
        csv_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_log.csv")
        fieldnames = [
            "filename", "total_cells", "trash_cells", "clean_cells",
            "trash_density_pct", "avg_anomaly_score",
        ]
        with open(csv_path, "w", newline="") as f:
            writer_csv = csv.DictWriter(f, fieldnames=fieldnames)
            writer_csv.writeheader()
            writer_csv.writerows(frame_results)
        print(f"  CSV log → {csv_path}")

        avg_density = round(
            sum(r["trash_density_pct"] for r in frame_results) / len(frame_results), 1
        )
        print(f"  Average debris density across video: {avg_density}%")


# ---------------------------------------------------------------
#  CLI
# ---------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(
        description="AquaScan — Underwater Debris Detection CLI (v3)\n"
                    "Adaptive z-score pipeline with 5 detection checks.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument(
        "--input", "-i", required=True,
        help="Path to an image (.jpg/.png) or video (.mp4/.avi)",
    )
    p.add_argument(
        "--grid", "-g", default="4x4",
        help="Grid dimensions as ROWSxCOLS, e.g. 4x4 (default) or 6x6",
    )
    p.add_argument(
        "--annotations", "-a", default=None,
        help="Path to ground-truth JSON file for accuracy measurement",
    )
    p.add_argument(
        "--every", "-e", type=int, default=config.PROCESS_EVERY_N_FRAMES,
        help=f"Video: process every Nth frame (default {config.PROCESS_EVERY_N_FRAMES})",
    )
    p.add_argument(
        "--sigma", type=float, default=1.5,
        help="Outlier sensitivity (z-score threshold). Lower = more sensitive. Default 1.5",
    )
    p.add_argument(
        "--checks", type=int, default=2,
        help="Min checks to flag a cell (1-5). Default 2",
    )
    p.add_argument(
        "--show", "-s", action="store_true",
        help="Display result windows while processing",
    )
    p.add_argument(
        "--no-dehaze", action="store_true",
        help="Skip dehazing step (faster, good for clear water)",
    )
    return p


def main():
    ensure_dirs()
    args = build_parser().parse_args()
    rows, cols = parse_grid(args.grid)

    cfg = DetectionConfig(
        outlier_sigma=max(0.5, min(float(args.sigma), 3.0)),
        checks_to_flag=max(1, min(int(args.checks), 5)),
        dehaze=not args.no_dehaze,
    )

    if not os.path.exists(args.input):
        print(f"[ERROR] File not found: {args.input}")
        sys.exit(1)

    if is_video(args.input):
        process_video(
            args.input, rows, cols, cfg,
            every_n=args.every, show=args.show,
        )
    else:
        process_image(
            args.input, rows, cols, cfg,
            annotation_path=args.annotations,
            show=args.show,
        )


if __name__ == "__main__":
    main()
