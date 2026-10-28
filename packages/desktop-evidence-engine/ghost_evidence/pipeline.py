"""End-to-End Desktop Evidence Ingestion & Analysis Pipeline."""

import os
import uuid
import json
from typing import Dict, Any, Optional, List
import cv2

from ghost_evidence.models.evidence import EvidenceAsset, EvidenceType, MediaMetadata
from ghost_evidence.models.timeline import EvidenceTimeline, DesktopState, TimelineEvent
from ghost_evidence.models.observation import EvidenceObservation, ObservationType, InferenceStatus, QualityLevel
from ghost_evidence.models.provenance import EvidenceProvenance
from ghost_evidence.models.semantic import BusinessProcessUnderstanding, SemanticEvent, SemanticActionType
from ghost_evidence.media.validator import validate_media_file
from ghost_evidence.media.extractor import extract_media_metadata
from ghost_evidence.media.sampler import sample_video_frames, ExtractedFrame
from ghost_evidence.ocr.composite import CompositeOCRProvider
from ghost_evidence.ui_detection.detector import UIDetector
from ghost_evidence.ui_detection.window import WindowDetector
from ghost_evidence.pointer.analyzer import PointerAnalyzer
from ghost_evidence.keyboard.analyzer import KeyboardAnalyzer
from ghost_evidence.state.reconstructor import DesktopStateReconstructor
from ghost_evidence.semantic.action_reconstructor import ActionReconstructor
from ghost_evidence.semantic.process_understanding import ProcessUnderstandingEngine
from ghost_evidence.models.events import ApplicationTransitionEvent, AppSwitchEventType


from ghost_evidence.semantic.provider import DeterministicSemanticReasoningProvider


class DesktopEvidencePipeline:
    """Master orchestrator for general desktop demonstration analysis."""

    def __init__(self, ocr_provider=None, reasoning_provider=None):
        self.ocr = ocr_provider or CompositeOCRProvider()
        self.ui_detector = UIDetector()
        self.window_detector = WindowDetector()
        self.pointer_analyzer = PointerAnalyzer()
        self.keyboard_analyzer = KeyboardAnalyzer()
        self.state_reconstructor = DesktopStateReconstructor()
        self.action_reconstructor = ActionReconstructor()
        self.process_engine = ProcessUnderstandingEngine()
        self.reasoning_provider = reasoning_provider or DeterministicSemanticReasoningProvider()

    def process_media(
        self,
        media_path: str,
        output_dir: str,
        tenant_id: str = "tenant_default",
        worker_id: Optional[str] = None,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes the full desktop evidence analysis pipeline.
        Returns a rich structured JSON payload containing:
        - metadata
        - timeline
        - desktop states
        - observations
        - semantic actions
        - business process understanding
        - uncertainties & contradictions
        """
        media_id = job_id or f"media_{uuid.uuid4().hex[:12]}"
        work_dir = os.path.join(output_dir, media_id)
        os.makedirs(work_dir, exist_ok=True)

        # 1. Validation
        valid, msg, ev_type = validate_media_file(media_path)
        if not valid:
            raise ValueError(f"Media validation failed: {msg}")

        # 2. Extract Metadata
        meta = extract_media_metadata(media_path, ev_type)
        asset = EvidenceAsset(
            id=media_id,
            tenant_id=tenant_id,
            worker_id=worker_id,
            evidence_type=ev_type,
            file_name=os.path.basename(media_path),
            file_path=media_path,
            mime_type=f"video/{meta.codec.lower()}" if ev_type == EvidenceType.VIDEO else f"image/{meta.codec.lower()}",
            size_bytes=meta.file_size_bytes,
            metadata=meta,
            created_at=f"{media_id}_time",
        )

        # 3. Frame Sampling
        extracted_frames: List[ExtractedFrame] = []
        if ev_type == EvidenceType.VIDEO:
            import sys
            print(f"[PROGRESS:SAMPLING] Sampling video frames from {os.path.basename(media_path)}...", file=sys.stderr, flush=True)
            extracted_frames = sample_video_frames(
                video_path=media_path,
                output_dir=work_dir,
                base_interval_seconds=1.2,
                dense_window_seconds=0.5,
                dense_interval_seconds=0.3,
                max_frames=120,
            )
            print(f"[PROGRESS:FRAMES] Extracted {len(extracted_frames)} keyframes. Analyzing UI elements and OCR...", file=sys.stderr, flush=True)
        else:
            # Single image / screenshot
            img = cv2.imread(media_path)
            if img is not None:
                frame_obj = ExtractedFrame(
                    frame_id="frame_000000",
                    frame_number=0,
                    timestamp_seconds=0.0,
                    image_bgr=img,
                )
                frame_obj.image_path = media_path
                frame_obj.thumbnail_path = media_path
                extracted_frames = [frame_obj]

        # 4. Multi-modal Analysis per Frame
        ocr_results_by_frame = {}
        ui_elements_by_frame = {}
        apps_by_frame = {}
        states: List[DesktopState] = []
        all_observations: List[EvidenceObservation] = []
        cursor_trajectory = []

        prev_app = None
        app_transitions: List[ApplicationTransitionEvent] = []
        prev_ocr_items = []
        keyboard_events = []

        total_frames = len(extracted_frames)
        for idx, frame in enumerate(extracted_frames):
            if idx > 0 and (idx % max(1, total_frames // 3) == 0 or idx == total_frames - 1):
                import sys
                pct = int(((idx + 1) / total_frames) * 100)
                print(f"[PROGRESS:ANALYZING] Processed {idx + 1}/{total_frames} frames ({pct}%)...", file=sys.stderr, flush=True)

            fid = frame.frame_id
            ts = frame.timestamp_seconds

            prev_frame_bgr = extracted_frames[idx - 1].image_bgr if idx > 0 else None
            prev_fid = extracted_frames[idx - 1].frame_id if idx > 0 else None

            # Fast perceptual difference check to skip redundant OCR on near-identical frames (< 2.5% diff)
            is_static_repeat = False
            if prev_frame_bgr is not None and frame.image_bgr is not None and prev_frame_bgr.shape == frame.image_bgr.shape:
                try:
                    sm1 = cv2.resize(frame.image_bgr, (64, 36))
                    sm2 = cv2.resize(prev_frame_bgr, (64, 36))
                    diff = float(np.mean(cv2.absdiff(sm1, sm2))) / 255.0
                    if diff < 0.025:
                        is_static_repeat = True
                except Exception:
                    pass

            if is_static_repeat and prev_fid and prev_fid in ocr_results_by_frame:
                prev_res = ocr_results_by_frame[prev_fid]
                from ghost_evidence.ocr.base import OCRFrameResult
                ocr_res = OCRFrameResult(
                    frame_id=fid,
                    timestamp=ts,
                    text_items=prev_res.text_items,
                    relationships=prev_res.relationships,
                    raw_full_text=prev_res.raw_full_text,
                    provider_name="cached_repeat"
                )
                ocr_results_by_frame[fid] = ocr_res
                app_name, win_title = apps_by_frame.get(prev_fid, ("Desktop", "Desktop Window"))
                apps_by_frame[fid] = (app_name, win_title)
                ui_elems = ui_elements_by_frame.get(prev_fid, [])
                ui_elements_by_frame[fid] = ui_elems
            else:
                # Downscale large frames to max 1280px width for fast high-accuracy OCR
                h, w = frame.image_bgr.shape[:2]
                if w > 1280:
                    scale = 1280.0 / w
                    ocr_img = cv2.resize(frame.image_bgr, (1280, int(h * scale)), interpolation=cv2.INTER_AREA)
                else:
                    scale = 1.0
                    ocr_img = frame.image_bgr

                # (a) OCR
                ocr_res = self.ocr.extract_text(ocr_img, fid, ts)
                if scale != 1.0 and ocr_res.text_items:
                    inv = 1.0 / scale
                    for it in ocr_res.text_items:
                        it.bounding_box.x = round(it.bounding_box.x * inv, 1)
                        it.bounding_box.y = round(it.bounding_box.y * inv, 1)
                        it.bounding_box.width = round(it.bounding_box.width * inv, 1)
                        it.bounding_box.height = round(it.bounding_box.height * inv, 1)
                ocr_results_by_frame[fid] = ocr_res

                # (b) Window & Application detection
                app_name, win_title, win_bounds = self.window_detector.detect_active_application(
                    frame.image_bgr, ocr_res.text_items, fallback_app="Desktop"
                )
                apps_by_frame[fid] = (app_name, win_title)

                # (c) Visual UI Detection
                ui_elems = self.ui_detector.detect_elements(
                    frame.image_bgr, ocr_res.text_items, fid, ts, application=app_name, window_title=win_title
                )
                ui_elements_by_frame[fid] = ui_elems

            # Detect application switches
            if prev_app is not None and app_name != prev_app:
                app_transitions.append(ApplicationTransitionEvent(
                    id=f"trans_{len(app_transitions)}",
                    timestamp=ts,
                    event_type=AppSwitchEventType.APPLICATION_SWITCH,
                    from_application=prev_app,
                    to_application=app_name,
                    window_title=win_title,
                    confidence=0.94,
                    inference_status=InferenceStatus.OBSERVED,
                    evidence_frame_ids=[fid],
                ))
            elif prev_app is None:
                app_transitions.append(ApplicationTransitionEvent(
                    id=f"trans_{len(app_transitions)}",
                    timestamp=ts,
                    event_type=AppSwitchEventType.APPLICATION_OPEN,
                    to_application=app_name,
                    window_title=win_title,
                    confidence=0.96,
                    inference_status=InferenceStatus.OBSERVED,
                    evidence_frame_ids=[fid],
                ))
            prev_app = app_name

            # (c) Visual UI Detection
            ui_elems = self.ui_detector.detect_elements(
                frame.image_bgr, ocr_res.text_items, fid, ts, application=app_name, window_title=win_title
            )
            ui_elements_by_frame[fid] = ui_elems

            # (d) Pointer / Cursor Tracking
            prev_frame_bgr = extracted_frames[idx - 1].image_bgr if idx > 0 else None
            cursor_loc = self.pointer_analyzer.detect_cursor_in_frame(frame.image_bgr, prev_frame_bgr)
            cursor_pos = None
            if cursor_loc:
                cx, cy, _ = cursor_loc
                cursor_pos = {"x": cx, "y": cy}
                cursor_trajectory.append((ts, cx, cy, fid))

            # (e) Keyboard field mutation analysis
            if idx > 0 and prev_ocr_items:
                kb_events = self.keyboard_analyzer.analyze_field_mutations(
                    prev_ocr_items, ocr_res.text_items, ts, fid,
                    cursor_pos=cursor_pos,
                    ui_elements=ui_elems
                )
                keyboard_events.extend(kb_events)
            prev_ocr_items = ocr_res.text_items

            # (f) Desktop State Reconstruction
            d_state = self.state_reconstructor.reconstruct_state(
                frame_id=fid,
                timestamp=ts,
                application=app_name,
                window_title=win_title,
                window_bounds=win_bounds,
                ocr_result=ocr_res,
                ui_elements=ui_elems,
                cursor_pos=cursor_pos,
                workflow_context=f"Interacting with {app_name}",
            )
            states.append(d_state)

            # (g) Create granular observations
            all_observations.append(EvidenceObservation(
                id=f"obs_app_{fid}",
                source_media_id=media_id,
                frame_id=fid,
                timestamp=ts,
                observation_type=ObservationType.ACTIVE_APPLICATION,
                inference_status=InferenceStatus.OBSERVED,
                quality_level=QualityLevel.EXACT,
                confidence=0.95,
                application=app_name,
                window_title=win_title,
                bounding_box=win_bounds,
                extracted_value=app_name,
                provenance=EvidenceProvenance(
                    source_media_id=media_id,
                    start_timestamp=ts,
                    end_timestamp=ts,
                    frame_ids=[fid],
                    confidence=0.95,
                    rationale=f"Active application identified as {app_name} from window title/branding",
                )
            ))

            for it in ocr_res.text_items:
                all_observations.append(EvidenceObservation(
                    id=f"obs_txt_{it.id}",
                    source_media_id=media_id,
                    frame_id=fid,
                    timestamp=ts,
                    observation_type=ObservationType.OCR_TEXT,
                    inference_status=InferenceStatus.OBSERVED,
                    quality_level=QualityLevel.HIGH_CONFIDENCE if it.confidence > 0.8 else QualityLevel.MEDIUM_CONFIDENCE,
                    confidence=it.confidence,
                    application=app_name,
                    window_title=win_title,
                    bounding_box=it.bounding_box,
                    extracted_value=it.text,
                    provenance=EvidenceProvenance(
                        source_media_id=media_id,
                        start_timestamp=ts,
                        end_timestamp=ts,
                        frame_ids=[fid],
                        confidence=it.confidence,
                        rationale=f"OCR extracted text '{it.text}' at ({it.bounding_box.x}, {it.bounding_box.y})",
                    )
                ))

        # 5. Reconstruct Pointer Events
        scene_transition_ts = [f.timestamp_seconds for f in extracted_frames if f.is_transition]
        pointer_events = self.pointer_analyzer.reconstruct_pointer_events(
            cursor_trajectory=cursor_trajectory,
            ui_elements_by_frame=ui_elements_by_frame,
            scene_transitions=scene_transition_ts,
        )

        # 6. Reconstruct Candidate Actions
        import sys
        print(f"[PROGRESS:ACTIONS] Reconstructing desktop user interactions and state transitions...", file=sys.stderr, flush=True)
        semantic_actions = self.action_reconstructor.reconstruct_actions(
            source_media_id=media_id,
            states=states,
            pointer_events=pointer_events,
            keyboard_events=keyboard_events,
            app_transitions=app_transitions,
        )

        # Segment and isolate genuine workflow actions from host recorder lifecycle noise:
        # Screen recordings typically start in the recorder UI (Autoworker) and end by returning to Autoworker to click Stop.
        # Filter out setup and teardown actions occurring in Autoworker or targeting recorder controls.
        RECORDER_FILTER_PATTERNS = {
            "autoworker", "localhost:5173", "localhost:4000", "127.0.0.1:5173",
            "teaching workspace", "live task execution", "stop recording", "stop sharing",
            "start recording", "is sharing your screen", "demonstrate task", "hide",
            "command room", "operations bay", "spatial floor", "what is ffmpeg",
            "al engineering roadmap", "chatgpt"
        }

        cleaned_actions = []
        for act in semantic_actions:
            app_lower = (act.application or "").lower()
            win_lower = (act.window_title or "").lower()
            desc_lower = (act.target_description or "").lower()
            summ_lower = (act.summary or "").lower()
            val_lower = str(act.parameters.get("value") or "").lower()

            # If the action is in a web page or application and targets real UI elements, preserve it
            is_app_action = (
                any(w in desc_lower or w in summ_lower for w in ["click", "enter", "select", "login", "cart", "add", "submit", "open", "type"])
                and not any(r in desc_lower or r in summ_lower or r in val_lower for r in RECORDER_FILTER_PATTERNS)
            )

            is_recorder = not is_app_action and (
                any(r in app_lower for r in ["autoworker"])
                or any(r in desc_lower or r in summ_lower or r in val_lower for r in RECORDER_FILTER_PATTERNS)
                or (win_lower.strip().startswith("autoworker") or win_lower.strip().startswith("localhost:5173"))
            )
            if not is_recorder:
                cleaned_actions.append(act)

        # Discard trailing teardown actions occurring in the final 3.5 seconds if targeting window closing or stop
        if extracted_frames and cleaned_actions:
            total_duration = extracted_frames[-1].timestamp_seconds
            while cleaned_actions:
                last_act = cleaned_actions[-1]
                if total_duration > 4.0 and last_act.start_timestamp > (total_duration - 3.5):
                    coord = last_act.target_selector.get("coordinate") or {}
                    last_desc = (last_act.target_description or "").lower()
                    if (
                        coord.get("y", 0) < 45
                        or coord.get("y", 0) > 950
                        or coord.get("x", 0) > 1850
                        or any(w in last_desc for w in ["stop", "close", "cancel", "hide"])
                    ):
                        cleaned_actions.pop()
                        continue
                break

        semantic_actions = cleaned_actions

        print(f"[PROGRESS:UNDERSTANDING] Synthesizing semantic task and process understanding...", file=sys.stderr, flush=True)
        all_ocr_texts = [t for s in states for t in s.visible_texts] if states else []
        if not all_ocr_texts and ocr_results:
            all_ocr_texts = [item.text for r in ocr_results for item in r.text_items]
        key_frame_paths = [f.image_path for f in extracted_frames if f.is_transition] or [f.image_path for f in extracted_frames[:8]]

        reasoned_result = self.reasoning_provider.reason_process(
            media_id=media_id,
            states=states,
            raw_actions=semantic_actions,
            all_ocr_texts=all_ocr_texts,
            key_frame_paths=key_frame_paths,
        )

        final_semantic_actions: List[SemanticEvent] = []
        for r_act in reasoned_result.get("actions", []):
            if isinstance(r_act, SemanticEvent):
                final_semantic_actions.append(r_act)
            elif isinstance(r_act, dict):
                act_type_str = r_act.get("action_type", "GENERIC_ACTION")
                try:
                    act_type_enum = SemanticActionType(act_type_str)
                except Exception:
                    act_type_enum = SemanticActionType.GENERIC_ACTION

                prov_data = r_act.get("provenance") or {}
                prov_frames = prov_data.get("frame_ids") if isinstance(prov_data, dict) else []
                if not prov_frames and extracted_frames:
                    prov_frames = [extracted_frames[0].frame_id]

                final_semantic_actions.append(SemanticEvent(
                    id=r_act.get("id") or f"sem_act_{len(final_semantic_actions)}",
                    action_type=act_type_enum,
                    application=r_act.get("application") or (reasoned_result.get("applications", ["Browser"])[0]),
                    window_title=r_act.get("window_title"),
                    target_description=r_act.get("target_description") or r_act.get("summary") or "Action target",
                    target_selector=r_act.get("target_selector") or {},
                    parameters=r_act.get("parameters") or {},
                    summary=r_act.get("summary") or "Action",
                    start_timestamp=float(r_act.get("start_timestamp", 0.0)),
                    end_timestamp=float(r_act.get("end_timestamp", 1.0)),
                    confidence=float(r_act.get("confidence", 0.95)),
                    inference_status=InferenceStatus.OBSERVED if r_act.get("evidence_status") == "OBSERVED" else InferenceStatus.INFERRED,
                    quality_level=QualityLevel.HIGH_CONFIDENCE,
                    provenance=EvidenceProvenance(
                        source_media_id=media_id,
                        start_timestamp=float(r_act.get("start_timestamp", 0.0)),
                        end_timestamp=float(r_act.get("end_timestamp", 1.0)),
                        frame_ids=prov_frames,
                        confidence=float(r_act.get("confidence", 0.95)),
                        rationale=r_act.get("summary") or "Reconstructed from demonstration evidence"
                    )
                ))

        if final_semantic_actions:
            semantic_actions = final_semantic_actions

        raw_obs_payloads = [obs.model_dump() for obs in all_observations]
        process_understanding = self.process_engine.infer_process(
            semantic_actions=semantic_actions,
            states=states,
            raw_observations=raw_obs_payloads,
        )
        if reasoned_result.get("task"):
            process_understanding.task_intent = reasoned_result["task"]
        if reasoned_result.get("description"):
            process_understanding.description = reasoned_result["description"]

        # 8. Build Evidence Timeline
        timeline_events: List[TimelineEvent] = []
        for act in semantic_actions:
            timeline_events.append(TimelineEvent(
                id=f"tl_evt_{act.id}",
                timestamp=act.start_timestamp,
                event_category="SEMANTIC",
                event_name=act.action_type.value,
                application=act.application,
                window_title=act.window_title,
                inference_status=act.inference_status,
                quality_level=act.quality_level,
                confidence=act.confidence,
                summary=act.summary,
                payload=act.parameters,
                frame_ids=act.provenance.frame_ids,
            ))

        timeline = EvidenceTimeline(
            source_media_id=media_id,
            total_duration_seconds=meta.duration_seconds,
            total_frames=meta.frame_count,
            sampled_frame_count=len(extracted_frames),
            states=states,
            events=timeline_events,
            applications_detected=process_understanding.applications_involved,
            transitions=app_transitions,
            observations=all_observations,
            uncertainties=[u.model_dump() for u in process_understanding.uncertainties],
            contradictions=[c.model_dump() for c in process_understanding.contradictions],
        )

        result_payload = {
            "media_id": media_id,
            "status": "COMPLETED",
            "asset": asset.model_dump(),
            "metadata": meta.model_dump(),
            "timeline": timeline.model_dump(),
            "process_understanding": process_understanding.model_dump(),
            "semantic_actions": [a.model_dump() for a in semantic_actions],
            "frames": [f.to_frame_reference().model_dump() for f in extracted_frames],
            "uncertainties": [u.model_dump() for u in process_understanding.uncertainties],
            "contradictions": [c.model_dump() for c in process_understanding.contradictions],
        }

        # Persist full JSON result in work_dir
        result_file = os.path.join(work_dir, "analysis_result.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2)

        return result_payload
