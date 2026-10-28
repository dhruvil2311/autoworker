"""Thumbnail and crop utilities."""

import os
import cv2
import numpy as np
from typing import Optional, Dict


def generate_crop(image: np.ndarray, bbox: Dict[str, float], output_path: str) -> Optional[str]:
    """Generates an image crop for a bounding box."""
    h, w = image.shape[:2]
    x = max(0, int(bbox.get("x", 0)))
    y = max(0, int(bbox.get("y", 0)))
    bw = min(w - x, int(bbox.get("width", w)))
    bh = min(h - y, int(bbox.get("height", h)))

    if bw <= 0 or bh <= 0:
        return None

    crop = image[y:y + bh, x:x + bw]
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return output_path
