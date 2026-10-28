"""Evidence provenance models connecting inferences back to raw frames."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class FrameReference(BaseModel):
    frame_id: str
    frame_number: int
    timestamp_seconds: float
    thumbnail_path: Optional[str] = None
    image_path: Optional[str] = None
    crop_path: Optional[str] = None
    bounding_box: Optional[Dict[str, float]] = None


class EvidenceProvenance(BaseModel):
    source_media_id: str
    source_type: str = "VIDEO"
    start_timestamp: float
    end_timestamp: float
    frame_ids: List[str] = Field(default_factory=list)
    frames: List[FrameReference] = Field(default_factory=list)
    source_observation_ids: List[str] = Field(default_factory=list)
    confidence: float = 1.0
    rationale: Optional[str] = None
    supporting_text: Optional[str] = None
    spatial_context: Optional[Dict[str, Any]] = None
