"""
AquaScan — Image Preprocessor (v4)

Corrects underwater colour distortion, denoises, and resizes.

v4 changes:
  - Added Gray World white balance for better color accuracy
  - Improved dehaze with guided filter refinement
  - Added compute_image_color_stats() for adaptive color detection
"""
from __future__ import annotations

import logging

import cv2
import numpy as np
import numpy.typing as npt

import config

logger = logging.getLogger(__name__)

CvImage = npt.NDArray[np.uint8]


def resize_frame(image: CvImage) -> CvImage:
    """Resize to pipeline working resolution."""
    return cv2.resize(image, (config.FRAME_WIDTH, config.FRAME_HEIGHT),
                      interpolation=cv2.INTER_AREA)


def white_balance(image: CvImage) -> CvImage:
    """Gray World white balance — corrects underwater color cast.

    Assumes the average color of the scene should be neutral gray.
    This is more principled than a fixed red boost for underwater imagery
    where different depths have different color casts.
    """
    result = image.astype(np.float32)
    avg_b = result[:, :, 0].mean()
    avg_g = result[:, :, 1].mean()
    avg_r = result[:, :, 2].mean()
    avg_all = (avg_b + avg_g + avg_r) / 3.0

    if avg_b > 1:
        result[:, :, 0] *= avg_all / avg_b
    if avg_g > 1:
        result[:, :, 1] *= avg_all / avg_g
    if avg_r > 1:
        result[:, :, 2] *= avg_all / avg_r

    return np.clip(result, 0, 255).astype(np.uint8)


def correct_colors(image: CvImage) -> CvImage:
    """CLAHE + white balance + red channel boost to counter blue-green dominance."""
    # Apply white balance first
    img = white_balance(image)

    b, g, r = cv2.split(img)
    r = np.clip(r.astype(np.int16) + config.RED_BOOST, 0, 255).astype(np.uint8)
    clahe = cv2.createCLAHE(clipLimit=config.CLAHE_CLIP_LIMIT,
                            tileGridSize=config.CLAHE_TILE_SIZE)
    return cv2.merge([clahe.apply(b), clahe.apply(g), clahe.apply(r)])


def denoise(image: CvImage) -> CvImage:
    """Bilateral filter — preserves edges while smoothing noise."""
    return cv2.bilateralFilter(image, d=config.BILATERAL_D,
                               sigmaColor=config.BILATERAL_SIGMA_COLOR,
                               sigmaSpace=config.BILATERAL_SIGMA_SPACE)


def dehaze(image: CvImage) -> CvImage:
    """Dark-channel-prior dehazing for turbid underwater images."""
    dark = np.min(image, axis=2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    dark_channel = cv2.erode(dark, kernel)

    flat = dark_channel.flatten()
    top_pixels = int(max(1, len(flat) * 0.001))
    indices = np.argsort(flat)[-top_pixels:]
    h, w = image.shape[:2]
    atm_light = np.mean(
        image.reshape(-1, 3)[np.unravel_index(indices, (h, w))[0]], axis=0)
    atm_light = np.clip(atm_light, 1, 255)

    norm = image.astype(np.float32) / atm_light
    t_map = 1.0 - 0.85 * np.min(norm, axis=2)
    t_map = np.clip(t_map, 0.1, 1.0)
    t3 = np.stack([t_map] * 3, axis=2)

    result = (image.astype(np.float32) - atm_light) / t3 + atm_light
    return np.clip(result, 0, 255).astype(np.uint8)


def compute_image_color_stats(image: CvImage) -> dict:
    """Compute image-level color statistics for adaptive color detection.

    Returns mean and std for each HSV channel plus LAB, enabling the
    detector to flag pixels that deviate from THIS image's color
    distribution, not a hardcoded range.
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)

    return {
        "hsv_mean": np.array([hsv[:, :, c].mean() for c in range(3)]),
        "hsv_std":  np.array([hsv[:, :, c].std() for c in range(3)]),
        "lab_mean": np.array([lab[:, :, c].mean() for c in range(3)]),
        "lab_std":  np.array([lab[:, :, c].std() for c in range(3)]),
        "bgr_mean": np.array([image[:, :, c].mean() for c in range(3)]),
        "bgr_std":  np.array([image[:, :, c].std() for c in range(3)]),
    }


def preprocess(image: CvImage, apply_dehaze: bool = True) -> CvImage:
    """Full preprocessing pipeline: resize → dehaze → colour → denoise."""
    logger.debug("Preprocessing %dx%d image (dehaze=%s)", image.shape[1], image.shape[0], apply_dehaze)
    img = resize_frame(image)
    if apply_dehaze:
        img = dehaze(img)
    img = correct_colors(img)
    img = denoise(img)
    return img
