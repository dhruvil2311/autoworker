"""Desktop state reconstruction and timeline models."""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from ghost_evidence.models.ui_element import UIElement, BoundingBox
from ghost_evidence.models.observation import EvidenceObservation, QualityLevel, InferenceStatus
from ghost_evidence.models.events import PointerEvent, KeyboardEvent, ApplicationTransitionEvent


class WindowState(BaseModel):
    window_id: str
    application: str
    window_title: str
    bounds: Optional[BoundingBox] = None
    is_active: bool = False
    is_dialog: bool = False
    is_maximized: bool = False
    process_name: Optional[str] = None


class DesktopState(BaseModel):
    timestamp: float
    frame_id: str
    active_application: str
    active_window_title: str
    windows: List[WindowState] = Field(default_factory=list)
    visible_elements: List[UIElement] = Field(default_factory=list)
    visible_texts: List[str] = Field(default_factory=list)
    cursor_position: Optional[Dict[str, float]] = None
    hovered_element: Optional[UIElement] = None
    active_dialog: Optional[str] = None
    browser_url: Optional[str] = None
    browser_tab_title: Optional[str] = None
    visual_change_detected: bool = False
    likely_user_intent: Optional[str] = None
    workflow_context: Optional[str] = None
    confidence: float = 1.0


class TimelineEvent(BaseModel):
    id: str
    timestamp: float
    event_category: str  # "APPLICATION", "POINTER", "KEYBOARD", "STATE_CHANGE", "SEMANTIC"
    event_name: str
    application: str
    window_title: Optional[str] = None
    inference_status: InferenceStatus = InferenceStatus.OBSERVED
    quality_level: QualityLevel = QualityLevel.HIGH_CONFIDENCE
    confidence: float = 1.0
    summary: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    frame_ids: List[str] = Field(default_factory=list)


class EvidenceTimeline(BaseModel):
    source_media_id: str
    total_duration_seconds: float
    total_frames: int
    sampled_frame_count: int
    states: List[DesktopState] = Field(default_factory=list)
    events: List[TimelineEvent] = Field(default_factory=list)
    applications_detected: List[str] = Field(default_factory=list)
    transitions: List[ApplicationTransitionEvent] = Field(default_factory=list)
    observations: List[EvidenceObservation] = Field(default_factory=list)
    uncertainties: List[Dict[str, Any]] = Field(default_factory=list)
    contradictions: List[Dict[str, Any]] = Field(default_factory=list)
