"""Base OCR provider abstraction."""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from ghost_evidence.models.ui_element import BoundingBox


class OCRTextItem(BaseModel):
    id: str
    text: str
    bounding_box: BoundingBox
    confidence: float = 1.0
    line_number: int = 0
    word_index: int = 0
    font_size_estimate: float = 12.0
    is_numeric: bool = False
    is_label_candidate: bool = False
    attributes: Dict[str, Any] = Field(default_factory=dict)


class SpatialRelationship(BaseModel):
    source_item_id: str
    target_item_id: str
    relation_type: str  # "RIGHT_OF", "BELOW", "INSIDE", "COLUMN_ALIGNED", "LABEL_VALUE"
    distance_px: float
    confidence: float = 1.0
    inferred_label: Optional[str] = None
    inferred_value: Optional[str] = None


class OCRFrameResult(BaseModel):
    frame_id: str
    timestamp: float
    text_items: List[OCRTextItem] = Field(default_factory=list)
    relationships: List[SpatialRelationship] = Field(default_factory=list)
    raw_full_text: str = ""
    provider_name: str = "default"


class BaseOCRProvider(ABC):
    """Abstract base class for all OCR providers."""

    @abstractmethod
    def extract_text(self, image_bgr: Any, frame_id: str, timestamp: float) -> OCRFrameResult:
        """Extracts text items with bounding boxes and confidence from an image."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Returns True if this OCR engine is installed and operational."""
        pass
