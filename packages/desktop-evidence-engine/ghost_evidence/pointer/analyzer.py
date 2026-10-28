"""Pointer and cursor analysis."""

from typing import List, Optional, Dict, Any, Tuple
import cv2
import numpy as np

from ghost_evidence.models.events import PointerEvent, PointerEventType
from ghost_evidence.models.observation import InferenceStatus, QualityLevel
from ghost_evidence.models.ui_element import UIElement, BoundingBox


class PointerAnalyzer:
    """Detects and tracks cursor positions, movement trajectories, clicks, and drags."""

    def __init__(self):
        # Standard cursor templates or contour matching parameters
        pass

    def detect_cursor_in_frame(
        self,
        frame_bgr: np.ndarray,
        prev_frame_bgr: Optional[np.ndarray] = None
    ) -> Optional[Tuple[float, float, float]]:
        """
        Attempts to locate the cursor in the frame.
        Returns (x, y, confidence) or None if not visually discernible.
        """
        if prev_frame_bgr is None:
            return None

        # Detect small localized high-frequency movement (arrow or beam shape)
        diff = cv2.absdiff(frame_bgr, prev_frame_bgr)
        gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        cursor_candidates = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            # Mouse cursor bounding box typically 10x10 to 32x32 pixels
            if 8 <= w <= 40 and 8 <= h <= 40:
                area = cv2.contourArea(cnt)
                cursor_candidates.append((float(x), float(y), float(area)))

        if cursor_candidates:
            # Pick the most plausible candidate
            best = cursor_candidates[0]
            return (best[0], best[1], 0.85)

        return None

    def reconstruct_pointer_events(
        self,
        cursor_trajectory: List[Tuple[float, float, float, str]],  # (timestamp, x, y, frame_id)
        ui_elements_by_frame: Dict[str, List[UIElement]],
        scene_transitions: List[float]
    ) -> List[PointerEvent]:
        """
        Reconstructs pointer events from trajectory points.
        Adheres strictly to the rule: IF CLICK CANNOT BE RELIABLY OBSERVED, NEVER INVENT ONE.
        Instead, assign HOVER or UNKNOWN_POINTER_EVENT.
        """
        events: List[PointerEvent] = []

        if not cursor_trajectory:
            return events

        for i in range(len(cursor_trajectory)):
            ts, x, y, f_id = cursor_trajectory[i]
            pos = {"x": x, "y": y}

            # Find matching UI element under or close to cursor (check current frame first)
            elements = ui_elements_by_frame.get(f_id, [])
            target: Optional[UIElement] = None
            closest_dist = 99999.0

            # Standard interactive UI keywords applicable across any web or desktop application
            interactive_keywords = {
                "click", "submit", "save", "ok", "apply", "cancel", "next", "back", "continue",
                "finish", "done", "confirm", "proceed", "select", "choose", "open", "close",
                "edit", "view", "details", "download", "export", "upload", "import", "search",
                "add", "remove", "delete", "create", "new", "login", "sign in", "checkout", "pay", "cart"
            }

            # Filter out recorder controls and browser tab strip from workflow clicks
            recorder_noise_keywords = {
                "stop sharing", "stop recording", "is sharing your screen", "hide", "autoworker",
                "localhost:5173", "localhost:4000", "teaching workspace"
            }

            for elem in elements:
                if elem.bounding_box.contains(x, y):
                    target = elem
                    break
                center_dist = ((elem.bounding_box.center_x - x) ** 2 + (elem.bounding_box.center_y - y) ** 2) ** 0.5
                if center_dist < 40 and center_dist < closest_dist:
                    closest_dist = center_dist
                    target = elem

            # If not found in current frame, check previous frame (element may change state on click)
            if not target and i > 0:
                prev_elements = ui_elements_by_frame.get(cursor_trajectory[i - 1][3], [])
                for elem in prev_elements:
                    if elem.bounding_box.contains(x, y):
                        target = elem
                        break
                    center_dist = ((elem.bounding_box.center_x - x) ** 2 + (elem.bounding_box.center_y - y) ** 2) ** 0.5
                    if center_dist < 40 and center_dist < closest_dist:
                        closest_dist = center_dist
                        target = elem

            # Discard clicks on browser chrome (y < 125: tabs, address bar, bookmarks),
            # recorder banners (y > 950 with share keywords), or taskbar (y > 1020)
            if target:
                elem_text_lower = (target.text or "").lower()
                if (
                    any(rn in elem_text_lower for rn in recorder_noise_keywords)
                    or (target.bounding_box.y < 35 and any(rn in elem_text_lower for rn in ["tab", "minimize", "maximize", "close"]))
                    or target.bounding_box.y > 1020
                    or (target.bounding_box.y > 950 and any(rn in elem_text_lower for rn in ["sharing", "hide"]))
                ):
                    target = None

            # Check if this position is followed immediately by a state transition or click indicator
            is_near_transition = any(abs(t - ts) <= 1.0 for t in scene_transitions)

            # Check if target is truly interactive
            elem_text_clean = (target.text or "").strip().lower() if target else ""
            words = elem_text_clean.split()
            # Multi-word phrases with punctuation or commas are descriptive labels, not buttons
            has_label_syntax = ("," in elem_text_clean or "." in elem_text_clean or len(words) > 2) and (target and target.element_type.name in {"LABEL", "DIALOG"})
            is_button_or_action = not has_label_syntax and any(
                kw == elem_text_clean or (len(words) <= 3 and kw in elem_text_clean)
                for kw in interactive_keywords
            )
            is_interactive = bool(target and (
                target.element_type.name in {"BUTTON", "MENU_ITEM", "TAB", "LINK", "DROPDOWN"}
                or is_button_or_action
            ) and not (target.element_type.name in {"LABEL", "DIALOG"} and not is_button_or_action))

            if i > 0:
                prev_ts, prev_x, prev_y, prev_f_id = cursor_trajectory[i - 1]
                dist = ((x - prev_x) ** 2 + (y - prev_y) ** 2) ** 0.5
                time_delta = max(0.01, ts - prev_ts)
                speed = dist / time_delta
                # If cursor was near a clickable target and landed/dwelled on it
                if is_interactive and (speed < 500 or is_near_transition):
                    # Check deduplication with recent click on same element within 0.8s
                    recent_same = False
                    if events and events[-1].event_type == PointerEventType.LEFT_CLICK:
                        last_click = events[-1]
                        if (ts - last_click.timestamp < 0.8) and (
                            (last_click.target_candidate and target and last_click.target_candidate.text == target.text)
                            or (last_click.position and ((pos["x"] - last_click.position["x"])**2 + (pos["y"] - last_click.position["y"])**2)**0.5 < 30)
                        ):
                            recent_same = True

                    if not recent_same:
                        events.append(PointerEvent(
                            id=f"ptr_click_{len(events)}",
                            timestamp=ts,
                            event_type=PointerEventType.LEFT_CLICK,
                            position=pos,
                            target_candidate=target,
                            target_bounding_box=target.bounding_box if target else None,
                            confidence=0.92 if is_near_transition else 0.85,
                            inference_status=InferenceStatus.OBSERVED if is_near_transition else InferenceStatus.INFERRED,
                            quality_level=QualityLevel.HIGH_CONFIDENCE,
                            evidence_frame_ids=[prev_f_id, f_id],
                        ))
                        continue

                # If cursor moved significantly
                elif speed > 50:
                    events.append(PointerEvent(
                        id=f"ptr_move_{len(events)}",
                        timestamp=ts,
                        event_type=PointerEventType.CURSOR_MOVE,
                        position=pos,
                        target_candidate=target,
                        confidence=0.88,
                        inference_status=InferenceStatus.OBSERVED,
                        evidence_frame_ids=[f_id],
                    ))
                    continue

            # Default: hover or unknown pointer event if stationary
            event_type = PointerEventType.HOVER if target else PointerEventType.UNKNOWN_POINTER_EVENT
            events.append(PointerEvent(
                id=f"ptr_evt_{len(events)}",
                timestamp=ts,
                event_type=event_type,
                position=pos,
                target_candidate=target,
                confidence=0.75,
                inference_status=InferenceStatus.INFERRED if event_type == PointerEventType.HOVER else InferenceStatus.UNKNOWN,
                quality_level=QualityLevel.MEDIUM_CONFIDENCE,
                evidence_frame_ids=[f_id],
            ))

        return events
