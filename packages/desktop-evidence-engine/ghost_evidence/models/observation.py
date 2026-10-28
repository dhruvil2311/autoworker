"""Observation models for Desktop Evidence Intelligence."""

from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from ghost_evidence.models.ui_element import BoundingBox, UIElement
from ghost_evidence.models.provenance import EvidenceProvenance


class InferenceStatus(str, Enum):
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    UNKNOWN = "UNKNOWN"


class QualityLevel(str, Enum):
    EXACT = "EXACT"
    HIGH_CONFIDENCE = "HIGH_CONFIDENCE"
    MEDIUM_CONFIDENCE = "MEDIUM_CONFIDENCE"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    UNKNOWN = "UNKNOWN"


class ObservationType(str, Enum):
    ACTIVE_APPLICATION = "ACTIVE_APPLICATION"
    VISIBLE_WINDOW = "VISIBLE_WINDOW"
    WINDOW_TITLE = "WINDOW_TITLE"
    OCR_TEXT = "OCR_TEXT"
    SPATIAL_RELATION = "SPATIAL_RELATION"
    UI_ELEMENT = "UI_ELEMENT"
    CURSOR_POSITION = "CURSOR_POSITION"
    CURSOR_EVENT = "CURSOR_EVENT"
    KEYBOARD_EVENT = "KEYBOARD_EVENT"
    VISUAL_CHANGE = "VISUAL_CHANGE"
    DIALOG_PROMPT = "DIALOG_PROMPT"
    NOTIFICATION = "NOTIFICATION"
    BROWSER_TAB = "BROWSER_TAB"
    BROWSER_URL = "BROWSER_URL"
    SELECTION = "SELECTION"
    HIGHLIGHT = "HIGHLIGHT"
    DESKTOP_STATE = "DESKTOP_STATE"
    UNKNOWN = "UNKNOWN"


class EvidenceObservation(BaseModel):
    id: str
    source_media_id: str
    frame_id: Optional[str] = None
    timestamp: float
    observation_type: ObservationType
    inference_status: InferenceStatus = InferenceStatus.OBSERVED
    quality_level: QualityLevel = QualityLevel.HIGH_CONFIDENCE
    confidence: float = 1.0

    # Payload
    application: Optional[str] = None
    window_title: Optional[str] = None
    bounding_box: Optional[BoundingBox] = None
    extracted_value: Any = None
    ui_element: Optional[UIElement] = None

    # Spatial and relational context
    label: Optional[str] = None
    associated_element_id: Optional[str] = None
    spatial_relationships: List[Dict[str, Any]] = Field(default_factory=list)

    # Provenance
    provenance: EvidenceProvenance
    metadata: Dict[str, Any] = Field(default_factory=dict)
