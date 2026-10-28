"""Adaptive frame sampling engine."""

import os
from typing import List, Dict, Any, Set
import cv2
import numpy as np

from ghost_evidence.media.scene_detector import detect_scene_changes
from ghost_evidence.models.provenance import FrameReference


class ExtractedFrame:
    def __init__(
        self,
        frame_id: str,
        frame_number: int,
        timestamp_seconds: float,
        image_bgr: np.ndarray,
        is_transition: bool = False,
        transition_score: float = 0.0,
    ):
        self.frame_id = frame_id
        self.frame_number = frame_number
        self.timestamp_seconds = timestamp_seconds
        self.image_bgr = image_bgr
        self.is_transition = is_transition
        self.transition_score = transition_score
        self.image_path: str = ""
        self.thumbnail_path: str = ""

    def to_frame_reference(self) -> FrameReference:
        return FrameReference(
            frame_id=self.frame_id,
            frame_number=self.frame_number,
            timestamp_seconds=self.timestamp_seconds,
            image_path=self.image_path,
            thumbnail_path=self.thumbnail_path,
        )


def sample_video_frames(
    video_path: str,
    output_dir: str,
    base_interval_seconds: float = 1.0,
    dense_window_seconds: float = 0.5,
    dense_interval_seconds: float = 0.2,
    max_frames: int = 120,
) -> List[ExtractedFrame]:
    """
    Performs multi-scale adaptive sampling:
    1. Low-frequency base sampling (e.g. 1 frame/sec)
    2. Scene transition detection
    3. Dense sampling around important visual transition boundaries
    """
    os.makedirs(output_dir, exist_ok=True)
    thumbs_dir = os.path.join(output_dir, "thumbnails")
    frames_dir = os.path.join(output_dir, "frames")
    os.makedirs(thumbs_dir, exist_ok=True)
    os.makedirs(frames_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if fps <= 0 or fps > 120:
        fps = 25.0
    raw_frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    total_frames = int(raw_frame_count) if (raw_frame_count > 0 and raw_frame_count < 100000000) else -1
    cap.release()

    # If container format (like WebM) does not expose total frame count, count frames via fast grab
    if total_frames <= 0:
        cap_count = cv2.VideoCapture(video_path)
        count = 0
        while cap_count.grab():
            count += 1
        cap_count.release()
        total_frames = count if count > 0 else -1

    # 1. Detect scene transitions
    transitions = detect_scene_changes(video_path, threshold=0.22, sample_stride=max(1, int(fps / 5)))
    transition_timestamps = {t.timestamp: t for t in transitions}

    # 2. Determine target frame indices to sample
    target_frames: Set[int] = set()

    base_step = max(1, int(fps * base_interval_seconds))
    dense_window_frames = int(fps * dense_window_seconds)
    dense_step = max(1, int(fps * dense_interval_seconds))

    if total_frames > 0:
        # (a) Low-frequency base sampling across full video duration
        for f_idx in range(0, total_frames, base_step):
            target_frames.add(f_idx)

        # (b) Always include first and last frames
        target_frames.add(0)
        if total_frames > 1:
            target_frames.add(total_frames - 1)

        # (c) Dense sampling around detected transitions
        for t in transitions:
            start_f = max(0, t.frame_number - dense_window_frames)
            end_f = min(total_frames - 1, t.frame_number + dense_window_frames)
            for f_idx in range(start_f, end_f, dense_step):
                target_frames.add(f_idx)

        # Cap if necessary to prevent unbounded memory, evenly subsampling across whole video
        sorted_indices = sorted(list(target_frames))
        if len(sorted_indices) > max_frames:
            step = len(sorted_indices) / float(max_frames)
            sorted_indices = [sorted_indices[int(i * step)] for i in range(max_frames)]
        target_set = set(sorted_indices)
    else:
        # Streaming WebM fallback: populate dense targets from transitions
        for t in transitions:
            start_f = max(0, t.frame_number - dense_window_frames)
            end_f = t.frame_number + dense_window_frames + 1
            for f_idx in range(start_f, end_f, dense_step):
                target_frames.add(f_idx)
        target_set = target_frames

    # 3. Extract frames from video
    cap = cv2.VideoCapture(video_path)
    extracted: List[ExtractedFrame] = []

    curr_idx = 0
    last_sampled_idx = -99999
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        is_sample = False
        if total_frames > 0:
            is_sample = curr_idx in target_set
        else:
            is_sample = (
                curr_idx == 0
                or (curr_idx in target_set)
                or (curr_idx - last_sampled_idx >= base_step)
            )

        if is_sample and len(extracted) < max_frames:
            last_sampled_idx = curr_idx
            timestamp = round(curr_idx / fps, 3)
            frame_id = f"frame_{curr_idx:06d}"

            # Check if this frame is near a transition
            is_trans = any(abs(t.timestamp - timestamp) <= 0.25 for t in transitions)
            best_score = max([t.score for t in transitions if abs(t.timestamp - timestamp) <= 0.25] or [0.0])

            # Save full image
            img_file = os.path.join(frames_dir, f"{frame_id}.jpg")
            cv2.imwrite(img_file, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

            # Save thumbnail
            thumb_w = 320
            h, w = frame.shape[:2]
            thumb_h = int(h * (thumb_w / float(w)))
            thumb = cv2.resize(frame, (thumb_w, thumb_h))
            thumb_file = os.path.join(thumbs_dir, f"{frame_id}_thumb.jpg")
            cv2.imwrite(thumb_file, thumb, [cv2.IMWRITE_JPEG_QUALITY, 75])

            obj = ExtractedFrame(
                frame_id=frame_id,
                frame_number=curr_idx,
                timestamp_seconds=timestamp,
                image_bgr=frame,
                is_transition=is_trans,
                transition_score=best_score,
            )
            obj.image_path = img_file
            obj.thumbnail_path = thumb_file
            extracted.append(obj)

        curr_idx += 1

    cap.release()
    return extracted
