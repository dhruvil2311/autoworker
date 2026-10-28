"""Vision LLM OCR Provider."""

import os
import json
import base64
import urllib.request
import urllib.error
import cv2
import numpy as np
from typing import List, Dict, Any, Optional

from ghost_evidence.ocr.base import BaseOCRProvider, OCRFrameResult, OCRTextItem
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.models.ui_element import BoundingBox


class VisionLLMOCRProvider(BaseOCRProvider):
    """OCR provider using Gemini or OpenAI-compatible Vision API."""

    def __init__(self, api_key: str = "", model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model_name = model_name

    def is_available(self) -> bool:
        return bool(self.api_key)

    def extract_text(self, image_bgr: np.ndarray, frame_id: str, timestamp: float) -> OCRFrameResult:
        if not self.is_available():
            return OCRFrameResult(frame_id=frame_id, timestamp=timestamp, provider_name="vision_llm_no_key")

        # Encode image to JPEG base64
        _, buffer = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
        b64_image = base64.b64encode(buffer).decode("utf-8")

        prompt = (
            "Analyze this desktop screen image and perform OCR. Return ONLY a valid JSON array of objects:\n"
            '[{"text": "extracted string", "x": 100, "y": 200, "width": 80, "height": 25, "confidence": 0.95}]\n'
            "Capture every visible button, label, field value, and table cell."
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64_image}}
                ]
            }],
            "generationConfig": {"temperature": 0.0, "response_mime_type": "application/json"}
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                text_content = resp_data["candidates"][0]["content"]["parts"][0]["text"]
                parsed_json = json.loads(text_content)

                items: List[OCRTextItem] = []
                full_text_parts = []
                if isinstance(parsed_json, list):
                    for idx, entry in enumerate(parsed_json):
                        txt = str(entry.get("text", "")).strip()
                        if not txt:
                            continue
                        box = BoundingBox(
                            x=float(entry.get("x", 0)),
                            y=float(entry.get("y", 0)),
                            width=float(entry.get("width", 50)),
                            height=float(entry.get("height", 20)),
                        )
                        items.append(OCRTextItem(
                            id=f"ocr_vis_{frame_id}_{idx}",
                            text=txt,
                            bounding_box=box,
                            confidence=float(entry.get("confidence", 0.9)),
                        ))
                        full_text_parts.append(txt)

                relationships = analyze_spatial_relationships(items)
                return OCRFrameResult(
                    frame_id=frame_id,
                    timestamp=timestamp,
                    text_items=items,
                    relationships=relationships,
                    raw_full_text=" ".join(full_text_parts),
                    provider_name="vision_llm",
                )
        except Exception:
            return OCRFrameResult(frame_id=frame_id, timestamp=timestamp, provider_name="vision_llm_failed")
