"""Pointer, keyboard, application, and window event models."""

from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from ghost_evidence.models.observation import InferenceStatus, QualityLevel
from ghost_evidence.models.ui_element import BoundingBox, UIElement


class PointerEventType(str, Enum):
    CURSOR_MOVE = "CURSOR_MOVE"
    LEFT_CLICK = "LEFT_CLICK"
    RIGHT_CLICK = "RIGHT_CLICK"
    DOUBLE_CLICK = "DOUBLE_CLICK"
    DRAG = "DRAG"
    HOVER = "HOVER"
    UNKNOWN_POINTER_EVENT = "UNKNOWN_POINTER_EVENT"


class PointerEvent(BaseModel):
    id: str
    timestamp: float
    event_type: PointerEventType
    position: Dict[str, float]  # {"x": 100, "y": 200}
    target_candidate: Optional[UIElement] = None
    target_bounding_box: Optional[BoundingBox] = None
    drag_start: Optional[Dict[str, float]] = None
    drag_end: Optional[Dict[str, float]] = None
    confidence: float = 1.0
    inference_status: InferenceStatus = InferenceStatus.OBSERVED
    quality_level: QualityLevel = QualityLevel.HIGH_CONFIDENCE
    evidence_frame_ids: List[str] = Field(default_factory=list)


class KeyboardEventType(str, Enum):
    TYPE = "TYPE"
    KEY_PRESS = "KEY_PRESS"
    HOTKEY = "HOTKEY"
    UNKNOWN_KEYBOARD_EVENT = "UNKNOWN_KEYBOARD_EVENT"


class KeyboardEvent(BaseModel):
    id: str
    timestamp: float
    event_type: KeyboardEventType
    text: Optional[str] = None
    key: Optional[str] = None
    hotkey: Optional[List[str]] = None
    target_field: Optional[UIElement] = None
    target_bounding_box: Optional[BoundingBox] = None
    inference_status: InferenceStatus = InferenceStatus.INFERRED
    quality_level: QualityLevel = QualityLevel.MEDIUM_CONFIDENCE
    confidence: float = 0.85
    observed_result: Optional[str] = None
    evidence_frame_ids: List[str] = Field(default_factory=list)


class AppSwitchEventType(str, Enum):
    APPLICATION_OPEN = "APPLICATION_OPEN"
    APPLICATION_SWITCH = "APPLICATION_SWITCH"
    WINDOW_FOCUS = "WINDOW_FOCUS"
    WINDOW_CLOSE = "WINDOW_CLOSE"


class ApplicationTransitionEvent(BaseModel):
    id: str
    timestamp: float
    event_type: AppSwitchEventType
    from_application: Optional[str] = None
    to_application: str
    window_title: Optional[str] = None
    process_name: Optional[str] = None
    confidence: float = 0.95
    inference_status: InferenceStatus = InferenceStatus.OBSERVED
    evidence_frame_ids: List[str] = Field(default_factory=list)
