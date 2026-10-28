"""Tesseract OCR Provider."""

import cv2
import numpy as np
from typing import List, Dict, Any

from ghost_evidence.ocr.base import BaseOCRProvider, OCRFrameResult, OCRTextItem
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.models.ui_element import BoundingBox


class TesseractOCRProvider(BaseOCRProvider):
    """OCR engine using PyTesseract."""

    def __init__(self, tesseract_cmd: str = ""):
        self.pytesseract = None
        self._available = False
        try:
            import os
            import pytesseract
            self.pytesseract = pytesseract
            
            # Auto-detect standard Windows installation paths if not on PATH
            if not tesseract_cmd:
                win_candidates = [
                    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
                ]
                for candidate in win_candidates:
                    if os.path.isfile(candidate):
                        tesseract_cmd = candidate
                        break

            if tesseract_cmd:
                pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
            # Check availability
            _ = pytesseract.get_tesseract_version()
            self._available = True
        except Exception:
            self._available = False

    def is_available(self) -> bool:
        return self._available

    def extract_text(self, image_bgr: np.ndarray, frame_id: str, timestamp: float) -> OCRFrameResult:
        if not self.is_available() or self.pytesseract is None:
            return OCRFrameResult(frame_id=frame_id, timestamp=timestamp, provider_name="tesseract_unavailable")

        # Preprocess image
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        data = self.pytesseract.image_to_data(gray, output_type=self.pytesseract.Output.DICT)

        items: List[OCRTextItem] = []
        full_text_parts = []

        n_boxes = len(data["text"])
        for i in range(n_boxes):
            text = data["text"][i].strip()
            conf = float(data["conf"][i])
            if text and conf > 20:
                x = float(data["left"][i])
                y = float(data["top"][i])
                w = float(data["width"][i])
                h = float(data["height"][i])

                item_id = f"ocr_{frame_id}_{len(items)}"
                is_num = text.replace(".", "").replace(",", "").isdigit()

                items.append(OCRTextItem(
                    id=item_id,
                    text=text,
                    bounding_box=BoundingBox(x=x, y=y, width=w, height=h),
                    confidence=round(conf / 100.0, 3),
                    line_number=data["line_num"][i],
                    word_index=data["word_num"][i],
                    font_size_estimate=h,
                    is_numeric=is_num,
                ))
                full_text_parts.append(text)

        relationships = analyze_spatial_relationships(items)
        return OCRFrameResult(
            frame_id=frame_id,
            timestamp=timestamp,
            text_items=items,
            relationships=relationships,
            raw_full_text=" ".join(full_text_parts),
            provider_name="tesseract",
        )
