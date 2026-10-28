"""Media processing modules."""

from ghost_evidence.media.validator import validate_media_file
from ghost_evidence.media.extractor import extract_media_metadata
from ghost_evidence.media.scene_detector import detect_scene_changes, SceneTransition
from ghost_evidence.media.sampler import sample_video_frames, ExtractedFrame
from ghost_evidence.media.thumbnail import generate_crop

__all__ = [
    "validate_media_file",
    "extract_media_metadata",
    "detect_scene_changes",
    "SceneTransition",
    "sample_video_frames",
    "ExtractedFrame",
    "generate_crop",
]
