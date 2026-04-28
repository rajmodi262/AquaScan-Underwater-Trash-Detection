"""
AquaScan — FastAPI Server (v3)

Thread-safe: all mutable detection params flow through DetectionConfig
(frozen dataclass), not global state mutation.

Endpoints:
  GET  /api/health          — liveness check
  POST /api/detect          — analyse an image
  POST /api/export          — export results as downloadable ZIP
  GET  /api/samples         — list sample images
  GET  /api/sample/{name}   — get a sample as base64
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import sys
import time
import zipfile
from functools import partial
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

import config
from config import DetectionConfig
from pipeline import Pipeline

# ── Logging ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("aquascan")

# ── Constants ───────────────────────────────────────────────────
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
STARTUP_TIME = time.time()

# ── App ─────────────────────────────────────────────────────────
app = FastAPI(
    title="AquaScan",
    version="3.1.0",
    description="Underwater debris detection via computer vision grid analysis.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipe = Pipeline()


# ── Routes ──────────────────────────────────────────────────────
@app.get("/api/health")
async def health() -> dict:
    uptime = int(time.time() - STARTUP_TIME)
    return {
        "status": "ok",
        "service": "AquaScan v3.1",
        "uptime_seconds": uptime,
        "version": "3.1.0",
    }


@app.post("/api/detect")
async def detect(
    file: UploadFile = File(...),
    grid_rows: int = Form(4),
    grid_cols: int = Form(4),
    dehaze: bool = Form(True),
    outlier_sigma: Optional[float] = Form(None),
    checks_to_flag: Optional[int] = Form(None),
) -> JSONResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        return JSONResponse(status_code=400, content={"error": "File must be an image (JPEG/PNG/WebP)"})

    if not (2 <= grid_rows <= 12 and 2 <= grid_cols <= 12):
        return JSONResponse(status_code=400, content={"error": "Grid size must be 2–12"})

    try:
        image_bytes: bytes = await file.read()

        # File size validation
        if len(image_bytes) > MAX_FILE_SIZE:
            return JSONResponse(
                status_code=400,
                content={"error": f"Image too large ({len(image_bytes) // 1024 // 1024}MB). Maximum is 10MB."},
            )

        if len(image_bytes) < 100:
            return JSONResponse(status_code=400, content={"error": "Image file is too small or empty"})

        # Build per-request config (thread-safe, immutable)
        cfg_kwargs: dict = {"dehaze": dehaze}
        if outlier_sigma is not None:
            cfg_kwargs["outlier_sigma"] = max(0.5, min(float(outlier_sigma), 3.0))
        if checks_to_flag is not None:
            cfg_kwargs["checks_to_flag"] = max(1, min(int(checks_to_flag), 6))
        det_cfg = DetectionConfig(**cfg_kwargs)

        logger.info("Analysing %s (%d bytes, grid=%dx%d, sigma=%.1f)",
                     file.filename, len(image_bytes), grid_rows, grid_cols, det_cfg.outlier_sigma)

        # Run CPU-heavy pipeline in thread pool to avoid blocking event loop
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None,
            partial(pipe.process, image_bytes,
                    grid_rows=grid_rows, grid_cols=grid_cols, cfg=det_cfg),
        )
        return JSONResponse(content=results)

    except ValueError as exc:
        logger.warning("Validation error: %s", exc)
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        logger.exception("Unhandled error during detection")
        return JSONResponse(status_code=500, content={"error": f"Internal error: {exc}"})


@app.post("/api/export")
async def export_results(
    file: UploadFile = File(...),
    grid_rows: int = Form(4),
    grid_cols: int = Form(4),
    dehaze: bool = Form(True),
    outlier_sigma: Optional[float] = Form(None),
    checks_to_flag: Optional[int] = Form(None),
) -> StreamingResponse:
    """Run detection and return results as a downloadable ZIP file."""
    try:
        image_bytes: bytes = await file.read()

        if len(image_bytes) > MAX_FILE_SIZE:
            return JSONResponse(
                status_code=400,
                content={"error": f"Image too large. Maximum is 10MB."},
            )

        cfg_kwargs: dict = {"dehaze": dehaze}
        if outlier_sigma is not None:
            cfg_kwargs["outlier_sigma"] = max(0.5, min(float(outlier_sigma), 3.0))
        if checks_to_flag is not None:
            cfg_kwargs["checks_to_flag"] = max(1, min(int(checks_to_flag), 5))
        det_cfg = DetectionConfig(**cfg_kwargs)

        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None,
            partial(pipe.process, image_bytes,
                    grid_rows=grid_rows, grid_cols=grid_cols, cfg=det_cfg),
        )

        # Build ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # Annotated image
            ann_b64 = results["images"]["annotated"].split(",", 1)[1]
            zf.writestr("annotated.jpg", base64.b64decode(ann_b64))

            # Heatmap
            heat_b64 = results["images"]["heatmap"].split(",", 1)[1]
            zf.writestr("heatmap.jpg", base64.b64decode(heat_b64))

            # JSON results
            export_data = {
                "summary": results["summary"],
                "cells": results["cells"],
                "settings": {
                    "grid": f"{grid_rows}x{grid_cols}",
                    "outlier_sigma": det_cfg.outlier_sigma,
                    "checks_to_flag": det_cfg.checks_to_flag,
                    "dehaze": det_cfg.dehaze,
                },
            }
            zf.writestr("results.json", json.dumps(export_data, indent=2))

            # Summary report
            s = results["summary"]
            report = (
                f"AquaScan Detection Report\n"
                f"{'=' * 40}\n"
                f"Grid:              {grid_rows}x{grid_cols}\n"
                f"Flagged cells:     {s['trash_cells']} / {s['total_cells']}\n"
                f"Debris density:    {s['trash_density_pct']}%\n"
                f"Avg anomaly score: {s['avg_anomaly_score']}\n"
                f"Processing time:   {s.get('processing_time_ms', 'N/A')}ms\n"
                f"Outlier sigma:     {det_cfg.outlier_sigma}\n"
                f"Min checks:        {det_cfg.checks_to_flag}\n"
                f"{'=' * 40}\n\n"
                f"Note: Anomaly scores are z-deviation measures,\n"
                f"not probability values.\n"
            )
            zf.writestr("report.txt", report)

        zip_buffer.seek(0)
        filename = os.path.splitext(file.filename or "scan")[0]
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="aquascan_{filename}.zip"'},
        )

    except Exception as exc:
        logger.exception("Export failed")
        return JSONResponse(status_code=500, content={"error": f"Export failed: {exc}"})


@app.get("/api/samples")
async def list_samples() -> dict[str, list[str]]:
    samples: list[str] = []
    if os.path.isdir(config.SAMPLE_DIR):
        for f in sorted(os.listdir(config.SAMPLE_DIR)):
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                samples.append(f)
    return {"samples": samples}


@app.get("/api/sample/{name}")
async def get_sample(name: str) -> JSONResponse:
    safe_name = os.path.basename(name)
    path = os.path.join(config.SAMPLE_DIR, safe_name)

    if not os.path.isfile(path):
        return JSONResponse(status_code=404, content={"error": f"Sample '{safe_name}' not found"})

    try:
        with open(path, "rb") as f:
            data = f.read()
        ext = safe_name.rsplit(".", 1)[-1].lower()
        mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp"}.get(ext, "jpeg")
        b64 = base64.b64encode(data).decode()
        return JSONResponse(content={"name": safe_name, "data": f"data:image/{mime};base64,{b64}"})
    except OSError:
        logger.exception("Failed to read sample %s", safe_name)
        return JSONResponse(status_code=500, content={"error": "Failed to read sample file"})


if __name__ == "__main__":
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    logger.info("AquaScan API v3.1 starting on http://localhost:8899")
    uvicorn.run(app, host="0.0.0.0", port=8899)
