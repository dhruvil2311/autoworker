"""Pluggable OCR package."""

from ghost_evidence.ocr.base import (
    BaseOCRProvider,
    OCRFrameResult,
    OCRTextItem,
    SpatialRelationship,
)
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.ocr.tesseract import TesseractOCRProvider
from ghost_evidence.ocr.vision_llm import VisionLLMOCRProvider
from ghost_evidence.ocr.composite import (
    CompositeOCRProvider,
    DeterministicHeuristicOCRProvider,
)

__all__ = [
    "BaseOCRProvider",
    "OCRFrameResult",
    "OCRTextItem",
    "SpatialRelationship",
    "analyze_spatial_relationships",
    "TesseractOCRProvider",
    "VisionLLMOCRProvider",
    "CompositeOCRProvider",
    "DeterministicHeuristicOCRProvider",
]
