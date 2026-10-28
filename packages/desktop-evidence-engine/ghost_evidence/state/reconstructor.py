"""Desktop state reconstruction engine."""

from typing import List, Dict, Any, Optional
from ghost_evidence.models.timeline import DesktopState, WindowState
from ghost_evidence.models.ui_element import UIElement, BoundingBox
from ghost_evidence.ocr.base import OCRFrameResult


class DesktopStateReconstructor:
    """Reconstructs DesktopState(t) at each sampled timestamp."""

    def reconstruct_state(
        self,
        frame_id: str,
        timestamp: float,
        application: str,
        window_title: str,
        window_bounds: Optional[BoundingBox],
        ocr_result: OCRFrameResult,
        ui_elements: List[UIElement],
        cursor_pos: Optional[Dict[str, float]] = None,
        workflow_context: Optional[str] = None
    ) -> DesktopState:
        # Identify active dialogs if any modal/dialog elements are present
        active_dialog = None
        for elem in ui_elements:
            if elem.element_type.name in {"DIALOG", "MODAL"}:
                active_dialog = elem.text or "System Dialog"
                break

        # Check if browser address/tab exists in address bar (y: 40 - 95)
        browser_url = None
        browser_tab = None
        if application == "Browser":
            for item in ocr_result.text_items:
                if 40 <= item.bounding_box.y <= 95:
                    txt = item.text.strip().lower()
                    if not any(ign in txt for ign in ["localhost:5173", "localhost:4000", "127.0.0.1", "sharing"]):
                        if txt.startswith("http://") or txt.startswith("https://") or "www." in txt or ".com" in txt or ".org" in txt or ".io" in txt:
                            browser_url = item.text.strip()
                            break
            browser_tab = window_title

        # Check hovered element under cursor
        hovered_elem = None
        if cursor_pos:
            cx, cy = cursor_pos.get("x", 0), cursor_pos.get("y", 0)
            for el in ui_elements:
                if el.bounding_box.contains(cx, cy):
                    hovered_elem = el
                    break

        # Window state
        windows = [
            WindowState(
                window_id=f"win_{application.lower()}",
                application=application,
                window_title=window_title,
                bounds=window_bounds,
                is_active=True,
                is_dialog=bool(active_dialog),
            )
        ]

        # Extract visible texts
        visible_texts = [it.text for it in ocr_result.text_items]

        # Formulate inferred user intent
        likely_intent = f"Interacting with {application} ({window_title})"
        if active_dialog:
            likely_intent = f"Responding to dialog in {application}: {active_dialog}"
        elif hovered_elem and hovered_elem.text:
            likely_intent = f"Focusing on '{hovered_elem.text}' in {application}"

        return DesktopState(
            timestamp=timestamp,
            frame_id=frame_id,
            active_application=application,
            active_window_title=window_title,
            windows=windows,
            visible_elements=ui_elements,
            visible_texts=visible_texts,
            cursor_position=cursor_pos,
            hovered_element=hovered_elem,
            active_dialog=active_dialog,
            browser_url=browser_url,
            browser_tab_title=browser_tab,
            likely_user_intent=likely_intent,
            workflow_context=workflow_context,
            confidence=0.92,
        )
