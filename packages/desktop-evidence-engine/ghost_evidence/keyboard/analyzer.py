"""Keyboard event analysis and typing inference."""

from typing import List, Dict, Any, Optional
from ghost_evidence.models.events import KeyboardEvent, KeyboardEventType
from ghost_evidence.models.observation import InferenceStatus, QualityLevel
from ghost_evidence.models.ui_element import UIElement
from ghost_evidence.ocr.base import OCRTextItem


# Platform recorder & chrome strings that must NEVER be treated as user form inputs
RECORDER_AND_CHROME_PATTERNS = {
    "autoworker", "localhost:5173", "localhost:4000", "127.0.0.1",
    "stop sharing", "stop recording", "is sharing your screen", "hide",
    "teaching workspace", "evidence viewer", "run inspector", "workstation",
    "new tab", "google chrome", "chrome", "edge", "firefox", "safari",
    "al engineering roadmap", "ask gemini", "chatgpt", "bookmark",
    "command room", "operations bay", "demonstrate task", "screen recording",
    "spatial floor", "ihi apps", "ii apps", "apps"
}

BUTTON_ACTION_PATTERNS = {
    "login", "sign in", "submit", "checkout", "continue", "finish", "cancel",
    "add to cart", "remove", "save", "delete", "close", "apply", "ok", "search"
}

INPUT_PLACEHOLDERS = {
    "username", "user name", "password", "email", "search", "enter", "type here",
    "first name", "last name", "phone", "address", "zip", "postal code", "name"
}


def is_plausible_input_value(val: str) -> bool:
    """Verifies that a string is a plausible user-entered input rather than page text."""
    v = val.strip()
    if not v or len(v) < 2 or len(v) > 60:
        return False
    v_lower = v.lower()
    if any(p in v_lower for p in RECORDER_AND_CHROME_PATTERNS):
        return False
    if v_lower in BUTTON_ACTION_PATTERNS:
        return False
    # Multi-word sentence check: form inputs are values, not multi-sentence descriptive paragraphs
    words = v.split()
    if len(words) > 6:
        return False
    # Sentence punctuation check
    if "." in v and not (v.endswith(".com") or v.endswith(".org") or v.endswith(".io") or v.replace(".", "").isdigit()):
        return False
    # Dialog and security breach notifications
    if any(w in v_lower for w in ["breach", "password manager", "recommends changing", "compromised", "privacy", "cookie"]):
        return False
    return True


class KeyboardAnalyzer:
    """
    Analyzes text mutations across consecutive frames to infer keyboard events.
    Enforces the tri-state model: OBSERVED, INFERRED, UNKNOWN.
    Distinguishes real in-page field typing from static page text, browser tabs, and recorder controls.
    """

    def _find_nearby_label(self, target_box, ocr_items: List[OCRTextItem]) -> Optional[str]:
        """
        Geometrically locates an adjacent field label.
        In standard UI layouts:
        1. Above: label is directly above the input box (dy > 0, small dx)
        2. Left: label is directly to the left on the same horizontal baseline (dx > 0, small dy)
        """
        best_label = None
        min_dist = 99999.0

        for item in ocr_items:
            # Ignore items in the browser window title / tab strip (y < 35) or taskbar (y > 1020)
            if item.bounding_box.y < 35 or item.bounding_box.y > 1020:
                continue

            t = item.text.strip()
            t_lower = t.lower()

            # Ignore buttons, generic site titles, and recorder keywords as field labels
            if any(p in t_lower for p in RECORDER_AND_CHROME_PATTERNS) or any(p == t_lower for p in BUTTON_ACTION_PATTERNS):
                continue
            if len(t) < 2 or len(t) > 40:
                continue

            # Check geometric placement relative to target box
            dx = target_box.x - item.bounding_box.right  # distance from label's right edge to target's left
            dy = target_box.y - item.bounding_box.bottom  # distance from label's bottom to target's top

            # Case A: Label directly above input box
            is_above = 0 <= dy <= 45 and abs(target_box.center_x - item.bounding_box.center_x) < 120

            # Case B: Label directly to the left of input box
            is_left = 0 <= dx <= 180 and abs(target_box.center_y - item.bounding_box.center_y) < 20

            if is_above or is_left:
                dist = (dx**2 + dy**2) ** 0.5
                if dist < min_dist:
                    min_dist = dist
                    best_label = t.rstrip(":")

        return best_label

    def analyze_field_mutations(
        self,
        prev_ocr_items: List[OCRTextItem],
        curr_ocr_items: List[OCRTextItem],
        timestamp: float,
        frame_id: str,
        active_element: Optional[UIElement] = None,
        cursor_pos: Optional[Dict[str, float]] = None,
        ui_elements: Optional[List[UIElement]] = None,
    ) -> List[KeyboardEvent]:
        events: List[KeyboardEvent] = []

        # If a massive batch of new items appeared simultaneously, this is a page navigation, NOT typing
        new_items = [
            curr for curr in curr_ocr_items
            if not any(curr.bounding_box.distance_to(p.bounding_box) < 25 for p in prev_ocr_items)
        ]
        if len(new_items) > 5:
            return events

        for curr in curr_ocr_items:
            val = curr.text.strip()

            # 1. SPATIAL FILTERING:
            # - Browser tab strip, address bar, bookmarks bar live at y < 125px.
            # - Screen share floating banner lives at y > 950px.
            # - Windows taskbar lives at y > 1020px.
            # Users NEVER type in-page form inputs in these OS/browser chrome regions.
            if curr.bounding_box.y < 35 or curr.bounding_box.y > 1020:
                continue

            # 2. PLAUSIBILITY FILTERING:
            # Rejects paragraphs, descriptions, alerts, tabs, recorder controls, and button words
            if not is_plausible_input_value(val):
                continue

            # Ignore visual bounding box placeholders, low confidence noise, single chars, or clocks
            if "TextRegion_" in val or curr.confidence < 0.45 or len(val) <= 1:
                continue
            if val.count(":") >= 1 and len(val) <= 5 and val.replace(":", "").isdigit():
                continue

            # 3. SPATIAL MATCHING WITH PREVIOUS FRAME:
            matched_prev = None
            for prev in prev_ocr_items:
                if curr.bounding_box.distance_to(prev.bounding_box) < 25:
                    matched_prev = prev
                    break

            field_label = self._find_nearby_label(curr.bounding_box, curr_ocr_items)
            field_elem = active_element

            # Check if text is inside a known input element
            is_inside_input_elem = False
            if ui_elements:
                for ue in ui_elements:
                    from ghost_evidence.models.ui_element import UIElementType
                    if ue.bounding_box.contains(curr.bounding_box.center_x, curr.bounding_box.center_y):
                        if ue.element_type == UIElementType.INPUT:
                            is_inside_input_elem = True
                            field_elem = ue
                            break
                        elif ue.element_type in (UIElementType.BUTTON, UIElementType.LINK, UIElementType.DIALOG):
                            # Explicit non-input element (buttons, links, dialog containers)
                            field_elem = ue
                            break

            # Discard text located inside buttons, links, or dialog containers
            if field_elem:
                from ghost_evidence.models.ui_element import UIElementType
                if field_elem.element_type in (UIElementType.BUTTON, UIElementType.LINK, UIElementType.DIALOG):
                    continue

            # Check cursor focus
            cursor_focused = False
            if cursor_pos:
                cx, cy = cursor_pos.get("x", -999), cursor_pos.get("y", -999)
                dx = abs(cx - curr.bounding_box.center_x)
                dy = abs(cy - curr.bounding_box.center_y)
                if dx < max(curr.bounding_box.width / 2 + 50, 70) and dy < max(curr.bounding_box.height / 2 + 25, 30):
                    cursor_focused = True

            if not field_elem and field_label:
                from ghost_evidence.models.ui_element import UIElementType
                field_elem = UIElement(
                    id=f"ui_field_{frame_id}_{len(events)}",
                    element_type=UIElementType.INPUT,
                    text=val,
                    label=field_label,
                    bounding_box=curr.bounding_box,
                    confidence=0.88,
                    timestamp=timestamp,
                    application="Browser",
                )

            # 4. STRICT TYPING INFERENCE RULES:
            # We ONLY infer typing if one of these 3 rigorous conditions is satisfied:
            # A) Progressive typing: existing text in the same box was extended or edited AND focused or input control
            # B) Placeholder replacement: an input placeholder (like 'Username') was replaced by val AND focused or input control
            # C) Focused input field: the cursor was focused inside an input box where text newly appeared

            should_infer_typing = False

            if matched_prev is not None and matched_prev.text.strip() != val:
                prev_text = matched_prev.text.strip()
                prev_lower = prev_text.lower()
                # Condition A: Progressive character extension (requires cursor focus or input element confirmation)
                if (val.startswith(prev_text) or prev_text.startswith(val)) and (is_inside_input_elem or cursor_focused):
                    should_infer_typing = True
                # Condition B: Placeholder replaced (e.g. 'Username' -> 'standard_user')
                elif any(ph in prev_lower for ph in INPUT_PLACEHOLDERS) and (is_inside_input_elem or cursor_focused or field_label is not None):
                    should_infer_typing = True
                    if not field_label:
                        field_label = prev_text

            elif matched_prev is None:
                # Condition C: Newly appeared text is ONLY typing if cursor was focused on it and it's an input
                if cursor_focused and (is_inside_input_elem or field_label is not None):
                    should_infer_typing = True

            if should_infer_typing:
                events.append(KeyboardEvent(
                    id=f"kb_type_{len(events)}",
                    timestamp=timestamp,
                    event_type=KeyboardEventType.TYPE,
                    text=val,
                    target_bounding_box=curr.bounding_box,
                    target_field=field_elem,
                    inference_status=InferenceStatus.INFERRED,
                    quality_level=QualityLevel.HIGH_CONFIDENCE if curr.confidence > 0.8 else QualityLevel.MEDIUM_CONFIDENCE,
                    confidence=round(curr.confidence, 2),
                    observed_result=val,
                    evidence_frame_ids=[frame_id],
                ))

        # Check for masked password typing:
        # If cursor was focused on a field with 'Password' placeholder in prev frame, and placeholder vanished
        if cursor_pos and prev_ocr_items:
            cx, cy = cursor_pos.get("x", -999), cursor_pos.get("y", -999)
            for prev in prev_ocr_items:
                prev_t = prev.text.strip().lower()
                if "password" in prev_t and prev.bounding_box.y >= 35 and prev.bounding_box.y <= 1020:
                    dx = abs(cx - prev.bounding_box.center_x)
                    dy = abs(cy - prev.bounding_box.center_y)
                    if dx < 120 and dy < 45:
                        # Placeholder was present and cursor is over it; check if still visible
                        still_present = any(
                            curr.bounding_box.distance_to(prev.bounding_box) < 25 and "password" in curr.text.strip().lower()
                            for curr in curr_ocr_items
                        )
                        if not still_present:
                            # User clicked into password field and typed masked value
                            from ghost_evidence.models.ui_element import UIElementType
                            p_elem = UIElement(
                                id=f"ui_pwd_{frame_id}",
                                element_type=UIElementType.INPUT,
                                text="••••••••",
                                label="Password",
                                bounding_box=prev.bounding_box,
                                confidence=0.92,
                                timestamp=timestamp,
                                application="Browser",
                            )
                            events.append(KeyboardEvent(
                                id=f"kb_type_pwd_{len(events)}",
                                timestamp=timestamp,
                                event_type=KeyboardEventType.TYPE,
                                text="••••••••",
                                target_bounding_box=prev.bounding_box,
                                target_field=p_elem,
                                inference_status=InferenceStatus.INFERRED,
                                quality_level=QualityLevel.HIGH_CONFIDENCE,
                                confidence=0.92,
                                observed_result="••••••••",
                                evidence_frame_ids=[frame_id],
                            ))

        return events

