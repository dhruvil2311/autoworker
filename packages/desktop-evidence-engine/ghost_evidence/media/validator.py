"""Media validation module."""

import os
from typing import Tuple
from ghost_evidence.models.evidence import EvidenceType


SUPPORTED_VIDEO_EXTS = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".wmv"}
SUPPORTED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}


def validate_media_file(file_path: str) -> Tuple[bool, str, EvidenceType]:
    """Validates that a media file exists, is readable, and detects its type."""
    if not os.path.exists(file_path):
        return False, f"File does not exist: {file_path}", EvidenceType.VIDEO

    if os.path.getsize(file_path) == 0:
        return False, f"File is empty: {file_path}", EvidenceType.VIDEO

    ext = os.path.splitext(file_path)[1].lower()

    if ext in SUPPORTED_VIDEO_EXTS:
        return True, "Valid video file", EvidenceType.VIDEO
    elif ext in SUPPORTED_IMAGE_EXTS:
        return True, "Valid image file", EvidenceType.SCREENSHOT
    elif ext == ".pdf":
        return True, "Valid PDF file", EvidenceType.PDF
    elif ext in {".csv", ".tsv"}:
        return True, "Valid CSV file", EvidenceType.CSV
    elif ext in {".xlsx", ".xls"}:
        return True, "Valid Excel file", EvidenceType.EXCEL
    elif ext in {".txt", ".md"}:
        return True, "Valid text file", EvidenceType.SOP_TEXT
    elif ext == ".json":
        return True, "Valid JSON recording trace", EvidenceType.DESKTOP_RECORDING
    else:
        return False, f"Unsupported media format: {ext}", EvidenceType.VIDEO
