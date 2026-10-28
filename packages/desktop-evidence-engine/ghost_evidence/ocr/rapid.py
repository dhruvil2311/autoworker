"""RapidOCR Provider (local ONNX-based OCR)."""

from typing import List, Optional
import numpy as np

from ghost_evidence.ocr.base import BaseOCRProvider, OCRFrameResult, OCRTextItem
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.models.ui_element import BoundingBox


class RapidOCRProvider(BaseOCRProvider):
    """High-accuracy, zero-dependency local OCR engine powered by RapidOCR ONNX."""

    def __init__(self):
        self._engine = None
        self._available = False
        try:
            from rapidocr_onnxruntime import RapidOCR
            self._engine = RapidOCR()
            self._available = True
        except Exception:
            self._available = False

    def is_available(self) -> bool:
        return self._available and self._engine is not None

    def extract_text(self, image_bgr: np.ndarray, frame_id: str, timestamp: float) -> OCRFrameResult:
        if not self.is_available() or self._engine is None:
            return OCRFrameResult(frame_id=frame_id, timestamp=timestamp, provider_name="rapidocr_unavailable")

        try:
            res, _ = self._engine(image_bgr)
        except Exception:
            res = None

        if not res:
            return OCRFrameResult(frame_id=frame_id, timestamp=timestamp, provider_name="rapidocr")

        items: List[OCRTextItem] = []
        full_text_parts: List[str] = []

        for idx, entry in enumerate(res):
            try:
                box_pts = entry[0]
                text = str(entry[1]).strip()
                conf = float(entry[2])

                if not text or conf < 0.2:
                    continue

                xs = [p[0] for p in box_pts]
                ys = [p[1] for p in box_pts]
                min_x = max(0.0, float(min(xs)))
                min_y = max(0.0, float(min(ys)))
                max_x = float(max(xs))
                max_y = float(max(ys))
                width = max(1.0, max_x - min_x)
                height = max(1.0, max_y - min_y)

                item_id = f"ocr_{frame_id}_{len(items)}"
                is_num = text.replace(".", "").replace(",", "").replace("$", "").isdigit()

                items.append(OCRTextItem(
                    id=item_id,
                    text=text,
                    bounding_box=BoundingBox(x=min_x, y=min_y, width=width, height=height),
                    confidence=round(conf, 3),
                    line_number=idx,
                    word_index=0,
                    font_size_estimate=height,
                    is_numeric=is_num,
                ))
                full_text_parts.append(text)
            except Exception:
                continue

        # Sort top-to-bottom, left-to-right
        items.sort(key=lambda item: (item.bounding_box.y, item.bounding_box.x))
        relationships = analyze_spatial_relationships(items)

        return OCRFrameResult(
            frame_id=frame_id,
            timestamp=timestamp,
            text_items=items,
            relationships=relationships,
            raw_full_text=" ".join(full_text_parts),
            provider_name="rapidocr",
        )
