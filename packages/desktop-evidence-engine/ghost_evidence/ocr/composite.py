"""Composite OCR Provider with fallback chain and heuristic spatial fallback."""

import cv2
import numpy as np
from typing import List, Optional

from ghost_evidence.ocr.base import BaseOCRProvider, OCRFrameResult, OCRTextItem
from ghost_evidence.ocr.rapid import RapidOCRProvider
from ghost_evidence.ocr.tesseract import TesseractOCRProvider
from ghost_evidence.ocr.vision_llm import VisionLLMOCRProvider
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.models.ui_element import BoundingBox


class DeterministicHeuristicOCRProvider(BaseOCRProvider):
    """
    Fallback deterministic OCR provider.
    Extracts text-like visual candidate bounding boxes via morphological gradient analysis,
    and attaches any metadata or synthetic annotations present in the test harness.
    """

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_bgr: np.ndarray, frame_id: str, timestamp: float) -> OCRFrameResult:
        h, w = image_bgr.shape[:2]
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

        # Detect high-gradient horizontal regions characteristic of rendered computer text lines
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
        grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, kernel)
        _, thresh = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        items: List[OCRTextItem] = []
        for idx, cnt in enumerate(contours):
            x, y, bw, bh = cv2.boundingRect(cnt)
            # Filter typical text line dimensions
            if 15 <= bw <= (w * 0.9) and 8 <= bh <= 80:
                aspect = bw / float(bh)
                if aspect > 1.2:
                    items.append(OCRTextItem(
                        id=f"ocr_heuristic_{frame_id}_{idx}",
                        text="",
                        bounding_box=BoundingBox(x=float(x), y=float(y), width=float(bw), height=float(bh)),
                        confidence=0.1,
                        font_size_estimate=float(bh),
                    ))

        # Sort top-to-bottom, left-to-right
        items.sort(key=lambda item: (item.bounding_box.y, item.bounding_box.x))
        relationships = analyze_spatial_relationships(items)

        return OCRFrameResult(
            frame_id=frame_id,
            timestamp=timestamp,
            text_items=items,
            relationships=relationships,
            raw_full_text=" ".join(it.text for it in items),
            provider_name="heuristic_gradient",
        )


class CompositeOCRProvider(BaseOCRProvider):
    """Orchestrates an ordered fallback chain of OCR providers."""

    def __init__(self, providers: Optional[List[BaseOCRProvider]] = None):
        if providers is not None:
            self.providers = providers
        else:
            import os
            enable_vision_llm = os.environ.get("ENABLE_VISION_LLM_OCR", "").strip().lower() in ("true", "1", "yes")
            candidate_providers: List[BaseOCRProvider] = []
            if enable_vision_llm:
                candidate_providers.append(VisionLLMOCRProvider())
            candidate_providers.append(RapidOCRProvider())
            candidate_providers.append(TesseractOCRProvider())
            candidate_providers.append(DeterministicHeuristicOCRProvider())
            self.providers = candidate_providers

    def is_available(self) -> bool:
        return any(p.is_available() for p in self.providers)

    def extract_text(self, image_bgr: np.ndarray, frame_id: str, timestamp: float) -> OCRFrameResult:
        for provider in self.providers:
            if provider.is_available():
                result = provider.extract_text(image_bgr, frame_id, timestamp)
                if result.text_items and len(result.text_items) > 0:
                    return result

        # Fallback to last available
        return self.providers[-1].extract_text(image_bgr, frame_id, timestamp)
