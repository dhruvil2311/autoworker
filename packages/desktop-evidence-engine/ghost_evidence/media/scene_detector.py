"""Scene boundary and visual transition detection."""

from typing import List, Tuple
import cv2
import numpy as np


class SceneTransition:
    def __init__(self, frame_number: int, timestamp: float, score: float, is_cut: bool = False):
        self.frame_number = frame_number
        self.timestamp = timestamp
        self.score = score
        self.is_cut = is_cut


def compute_frame_difference(frame1: np.ndarray, frame2: np.ndarray) -> float:
    """Computes normalized difference between two consecutive frames."""
    # 1. Resize to standard comparison resolution for speed and noise reduction
    h, w = 180, 320
    small1 = cv2.resize(frame1, (w, h))
    small2 = cv2.resize(frame2, (w, h))

    # 2. Color histogram distance in HSV space
    hsv1 = cv2.cvtColor(small1, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(small2, cv2.COLOR_BGR2HSV)

    hist1 = cv2.calcHist([hsv1], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [30, 32], [0, 180, 0, 256])

    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)

    hist_corr = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)

    # 3. Absolute pixel change ratio
    diff = cv2.absdiff(small1, small2)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray_diff, 25, 255, cv2.THRESH_BINARY)
    changed_pixels = np.count_nonzero(thresh)
    pixel_ratio = changed_pixels / float(w * h)

    # Combine metrics: low histogram correlation + high changed pixel ratio = scene transition
    transition_score = (1.0 - max(0.0, hist_corr)) * 0.5 + pixel_ratio * 0.5
    return float(transition_score)


def detect_scene_changes(
    video_path: str,
    threshold: float = 0.25,
    sample_stride: int = 5
) -> List[SceneTransition]:
    """Detects scene transition points in a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    transitions: List[SceneTransition] = []

    prev_frame = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_stride == 0:
            if prev_frame is not None:
                score = compute_frame_difference(prev_frame, frame)
                timestamp = round(frame_idx / fps, 3)
                if score >= threshold:
                    transitions.append(SceneTransition(
                        frame_number=frame_idx,
                        timestamp=timestamp,
                        score=score,
                        is_cut=score > (threshold * 1.5)
                    ))
            prev_frame = frame

        frame_idx += 1

    cap.release()
    return transitions
