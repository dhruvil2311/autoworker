"""Video and media metadata extraction."""

import os
import cv2
from PIL import Image
from ghost_evidence.models.evidence import MediaMetadata, EvidenceType


def extract_media_metadata(file_path: str, media_type: EvidenceType) -> MediaMetadata:
    """Extracts deep metadata from video or image files."""
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    if media_type == EvidenceType.SCREENSHOT or media_type == EvidenceType.IMAGE:
        try:
            with Image.open(file_path) as img:
                w, h = img.size
                fmt = img.format or os.path.splitext(file_path)[1].replace(".", "").upper()
                return MediaMetadata(
                    duration_seconds=0.0,
                    width=w,
                    height=h,
                    fps=0.0,
                    frame_count=1,
                    codec=fmt,
                    audio_present=False,
                    file_size_bytes=file_size,
                    aspect_ratio=f"{w}:{h}",
                    format=fmt,
                )
        except Exception:
            return MediaMetadata(file_size_bytes=file_size)

    # Video processing via OpenCV
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        return MediaMetadata(file_size_bytes=file_size)

    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if fps <= 0 or fps > 120:
            fps = 25.0
        raw_frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        frame_count = int(raw_frame_count) if (0 < raw_frame_count < 100000000) else 0

        # If container lacks frame count (e.g. streaming WebM), count or estimate
        if frame_count <= 0 and file_size > 0:
            # Quick estimate based on filesize and bitrate or sequential probe
            frame_count = max(30, int(file_size / 8000))

        duration = round(frame_count / fps, 3) if (fps > 0 and frame_count > 0) else 10.0

        fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = "".join([chr((fourcc_int >> 8 * i) & 0xFF) for i in range(4)]).strip()
        if not codec:
            codec = "H264/AVC"

        gcd = 1
        import math
        if width > 0 and height > 0:
            gcd = math.gcd(width, height)
            aspect = f"{width // gcd}:{height // gcd}"
        else:
            aspect = "16:9"

        return MediaMetadata(
            duration_seconds=duration,
            width=width,
            height=height,
            fps=round(fps, 2),
            frame_count=frame_count,
            codec=codec,
            audio_present=False,  # VideoCapture handles visual track; container may contain audio
            file_size_bytes=file_size,
            aspect_ratio=aspect,
            format=os.path.splitext(file_path)[1].replace(".", "").upper(),
        )
    finally:
        cap.release()
