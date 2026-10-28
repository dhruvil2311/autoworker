"""Spatial relationship analyzer for OCR text items."""

from typing import List, Tuple
from ghost_evidence.ocr.base import OCRTextItem, SpatialRelationship


LABEL_KEYWORDS = {
    "amount", "total", "customer", "order", "invoice", "date", "id", "number",
    "name", "price", "qty", "quantity", "status", "tax", "subtotal", "code",
    "item", "account", "balance", "vendor", "phone", "email", "address",
    "search", "find", "filter", "select", "password", "username", "file"
}


def analyze_spatial_relationships(items: List[OCRTextItem]) -> List[SpatialRelationship]:
    """
    Analyzes geometric relationships between text items.
    Infers:
    1. Horizontal label/value pairs: e.g. [Amount:] (x=100) -> [5000] (x=160, y~=100)
    2. Vertical label/value pairs: e.g. [Amount] (y=100) -> [5000] (y=130, x~=100)
    3. Column alignment in tables
    """
    relationships: List[SpatialRelationship] = []

    for i, item_a in enumerate(items):
        box_a = item_a.bounding_box
        text_a_clean = item_a.text.strip().rstrip(":").lower()
        is_label_a = (
            text_a_clean in LABEL_KEYWORDS
            or item_a.text.strip().endswith(":")
            or any(k in text_a_clean for k in LABEL_KEYWORDS)
        )

        for j, item_b in enumerate(items):
            if i == j:
                continue

            box_b = item_b.bounding_box

            # 1. Horizontal check: Item B is to the right of Item A on roughly the same baseline
            y_overlap = max(0, min(box_a.bottom, box_b.bottom) - max(box_a.y, box_b.y))
            min_height = min(box_a.height, box_b.height)

            if min_height > 0 and (y_overlap / min_height) >= 0.5:
                dx = box_b.x - box_a.right
                # If Item B is to the right within reasonable distance (e.g. up to 250px)
                if 0 <= dx <= 250:
                    confidence = max(0.4, 1.0 - (dx / 300.0))
                    rel_type = "LABEL_VALUE" if is_label_a else "RIGHT_OF"
                    relationships.append(SpatialRelationship(
                        source_item_id=item_a.id,
                        target_item_id=item_b.id,
                        relation_type=rel_type,
                        distance_px=round(dx, 1),
                        confidence=round(confidence, 2),
                        inferred_label=item_a.text.rstrip(":") if is_label_a else None,
                        inferred_value=item_b.text if is_label_a else None,
                    ))

            # 2. Vertical check: Item B is directly below Item A (like a form field or table row)
            x_overlap = max(0, min(box_a.right, box_b.right) - max(box_a.x, box_b.x))
            min_width = min(box_a.width, box_b.width)

            if min_width > 0 and (x_overlap / min_width) >= 0.4:
                dy = box_b.y - box_a.bottom
                if 0 <= dy <= 60:
                    confidence = max(0.4, 1.0 - (dy / 80.0))
                    rel_type = "LABEL_VALUE" if is_label_a else "BELOW"
                    relationships.append(SpatialRelationship(
                        source_item_id=item_a.id,
                        target_item_id=item_b.id,
                        relation_type=rel_type,
                        distance_px=round(dy, 1),
                        confidence=round(confidence, 2),
                        inferred_label=item_a.text.rstrip(":") if is_label_a else None,
                        inferred_value=item_b.text if is_label_a else None,
                    ))

    return relationships
