"""Visual UI detector for desktop controls and elements."""

from typing import List, Dict, Any, Optional
import cv2
import numpy as np

from ghost_evidence.models.ui_element import UIElement, UIElementType, BoundingBox
from ghost_evidence.ocr.base import OCRTextItem


BUTTON_KEYWORDS = {
    "save", "submit", "ok", "cancel", "apply", "close", "open", "delete",
    "edit", "new", "search", "find", "next", "previous", "back", "continue",
    "upload", "download", "export", "import", "login", "sign in", "post",
    "add to cart", "add", "checkout", "finish", "generate", "pdf", "cart",
    "confirm", "proceed", "pay", "order", "remove", "select", "create"
}


class UIDetector:
    """Detects UI controls and structures from visual frames and OCR data."""

    def detect_elements(
        self,
        image_bgr: np.ndarray,
        ocr_items: List[OCRTextItem],
        frame_id: str,
        timestamp: float,
        application: Optional[str] = None,
        window_title: Optional[str] = None
    ) -> List[UIElement]:
        elements: List[UIElement] = []
        h, w = image_bgr.shape[:2]

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

        # 1. Detect geometric rectangular UI controls (buttons, inputs, dialogs)
        # Using Canny edge detection and contour approximation
        edges = cv2.Canny(gray, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        geometric_boxes: List[BoundingBox] = []
        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                x, y, bw, bh = cv2.boundingRect(approx)
                # Discard full screen or minuscule noise
                if (bw > 20 and bh > 12) and (bw < w * 0.98 or bh < h * 0.98):
                    geometric_boxes.append(BoundingBox(x=float(x), y=float(y), width=float(bw), height=float(bh)))

        # 2. Correlate OCR text items with detected rectangles or create element representations
        used_ocr_ids = set()

        for box in geometric_boxes:
            contained_items = [
                item for item in ocr_items
                if box.contains(item.bounding_box.center_x, item.bounding_box.center_y)
            ]

            combined_text = " ".join(it.text for it in contained_items).strip()
            clean_text_lower = combined_text.lower()

            elem_type = UIElementType.UNKNOWN

            # Dialog detection: large centered box with buttons inside
            if box.width > 300 and box.height > 150 and box.width < w * 0.85:
                elem_type = UIElementType.DIALOG

            # Button detection: small aspect ratio rectangle containing button text
            elif (
                (box.height <= 60 and 30 <= box.width <= 300)
                and (
                    any(kw in clean_text_lower for kw in BUTTON_KEYWORDS)
                    or "btn" in clean_text_lower
                )
            ):
                elem_type = UIElementType.BUTTON

            # Input/Textbox: horizontal box, possibly editable
            elif 18 <= box.height <= 45 and 60 <= box.width <= 600:
                elem_type = UIElementType.INPUT

            # Dropdown: box with down-caret or select keyword
            elif "select" in clean_text_lower or "choose" in clean_text_lower:
                elem_type = UIElementType.DROPDOWN

            if elem_type != UIElementType.UNKNOWN:
                elem_id = f"ui_{frame_id}_{len(elements)}"
                elements.append(UIElement(
                    id=elem_id,
                    element_type=elem_type,
                    text=combined_text or None,
                    bounding_box=box,
                    confidence=0.88,
                    timestamp=timestamp,
                    application=application,
                    window_title=window_title,
                ))
                for it in contained_items:
                    used_ocr_ids.add(it.id)

        # 3. Create elements directly from standalone OCR text items that weren't inside boxes
        for item in ocr_items:
            if item.id in used_ocr_ids:
                continue

            text_lower = item.text.lower().strip()
            elem_type = UIElementType.LABEL

            if any(text_lower == kw or text_lower.startswith(kw) for kw in BUTTON_KEYWORDS):
                elem_type = UIElementType.BUTTON
            elif item.text.startswith("http://") or item.text.startswith("https://") or "www." in text_lower:
                elem_type = UIElementType.LINK
            elif text_lower.endswith(".xlsx") or text_lower.endswith(".csv") or text_lower.endswith(".pdf"):
                elem_type = UIElementType.FILE

            elements.append(UIElement(
                id=f"ui_text_{item.id}",
                element_type=elem_type,
                text=item.text,
                label=item.text if elem_type == UIElementType.LABEL else None,
                bounding_box=item.bounding_box,
                confidence=item.confidence,
                timestamp=timestamp,
                application=application,
                window_title=window_title,
            ))

        return elements
