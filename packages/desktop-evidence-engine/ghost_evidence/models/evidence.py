"""Evidence asset models for media ingestion."""

from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class EvidenceType(str, Enum):
    VIDEO = "VIDEO"
    SCREENSHOT = "SCREENSHOT"
    IMAGE = "IMAGE"
    PDF = "PDF"
    CSV = "CSV"
    EXCEL = "EXCEL"
    SOP_TEXT = "SOP_TEXT"
    BROWSER_RECORDING = "BROWSER_RECORDING"
    DESKTOP_RECORDING = "DESKTOP_RECORDING"


class MediaMetadata(BaseModel):
    duration_seconds: float = 0.0
    width: int = 0
    height: int = 0
    fps: float = 0.0
    frame_count: int = 0
    codec: str = "unknown"
    audio_present: bool = False
    channels: int = 0
    sample_rate: int = 0
    file_size_bytes: int = 0
    aspect_ratio: str = "16:9"
    format: str = "unknown"
    extra: Dict[str, Any] = Field(default_factory=dict)


class EvidenceAsset(BaseModel):
    id: str
    tenant_id: str
    worker_id: Optional[str] = None
    evidence_type: EvidenceType
    file_name: str
    file_path: str
    mime_type: str
    size_bytes: int = 0
    metadata: MediaMetadata = Field(default_factory=MediaMetadata)
    created_at: str
    status: str = "INGESTED"
