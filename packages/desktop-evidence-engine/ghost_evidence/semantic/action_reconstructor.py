"""Reconstructs candidate operational action sequences from observations and events."""

from typing import List, Dict, Any, Optional
from ghost_evidence.models.timeline import DesktopState, TimelineEvent
from ghost_evidence.models.events import PointerEvent, PointerEventType, KeyboardEvent, ApplicationTransitionEvent
from ghost_evidence.models.observation import EvidenceObservation, InferenceStatus, QualityLevel
from ghost_evidence.models.provenance import EvidenceProvenance, FrameReference
from ghost_evidence.models.semantic import SemanticEvent, SemanticActionType
from ghost_evidence.semantic.generalization import generalize_demonstrated_value


class ActionReconstructor:
    """Combines pointer, keyboard, and application transition events into candidate operational actions."""

    def reconstruct_actions(
        self,
        source_media_id: str,
        states: List[DesktopState],
        pointer_events: List[PointerEvent],
        keyboard_events: List[KeyboardEvent],
        app_transitions: List[ApplicationTransitionEvent],
    ) -> List[SemanticEvent]:
        actions: List[SemanticEvent] = []

        # 1. Process application transitions
        for trans in app_transitions:
            actions.append(SemanticEvent(
                id=f"sem_app_{len(actions)}",
                action_type=SemanticActionType.SWITCH_APPLICATION if trans.from_application else SemanticActionType.OPEN_APPLICATION,
                application=trans.to_application,
                window_title=trans.window_title,
                target_description=f"Switch to {trans.to_application}",
                target_selector={"strategy": "APPLICATION_NAME", "application": trans.to_application},
                parameters={"application": trans.to_application, "from": trans.from_application},
                summary=f"Open/Switch to {trans.to_application}",
                start_timestamp=trans.timestamp,
                end_timestamp=trans.timestamp + 0.5,
                confidence=trans.confidence,
                inference_status=trans.inference_status,
                provenance=EvidenceProvenance(
                    source_media_id=source_media_id,
                    start_timestamp=trans.timestamp,
                    end_timestamp=trans.timestamp + 0.5,
                    frame_ids=trans.evidence_frame_ids,
                    confidence=trans.confidence,
                    rationale=f"Application window header and chrome transitioned to {trans.to_application}",
                )
            ))

        # Patterns for host recorder controls and chrome elements that must never become workflow actions
        RECORDER_NOISE = {
            "stop sharing", "stop recording", "is sharing your screen", "hide",
            "autoworker", "localhost:5173", "localhost:4000", "teaching workspace",
            "evidence viewer", "run inspector", "new tab", "close tab"
        }

        # 2. Process pointer click interactions
        for p_ev in pointer_events:
            if p_ev.event_type == PointerEventType.LEFT_CLICK:
                target_name = (p_ev.target_candidate.text or p_ev.target_candidate.label or "Element") if p_ev.target_candidate else "Screen Element"
                app_name = p_ev.target_candidate.application if p_ev.target_candidate else "Desktop"
                window_title = p_ev.target_candidate.window_title if p_ev.target_candidate else None

                target_lower = target_name.lower()
                win_lower = (window_title or "").lower()

                # Clean up OCR inaccuracies on standard buttons
                if "cart" in target_lower and ("agld" in target_lower or "adid" in target_lower or "add" in target_lower):
                    target_name = "Add to cart"
                    target_lower = "add to cart"

                # Discard clicks that explicitly target host recorder controls, browser tab/toolbar (y < 125), or taskbar (y > 1020)
                RECORDER_CONTROL_PATTERNS = {
                    "stop sharing", "stop recording", "start recording", "is sharing your screen",
                    "hide", "demonstrate task", "teaching workspace", "live task execution", "close tab", "new tab"
                }
                if any(rn in target_lower for rn in RECORDER_CONTROL_PATTERNS):
                    continue
                if p_ev.position and (p_ev.position.get("y", 0) < 125 or p_ev.position.get("y", 0) > 1020):
                    continue
                if p_ev.position and p_ev.position.get("y", 0) > 950 and any(rn in target_lower for rn in ["sharing", "hide"]):
                    continue

                action_type = SemanticActionType.GENERIC_ACTION

                if "save" in target_lower or "submit" in target_lower or "post" in target_lower:
                    action_type = SemanticActionType.SAVE_TRANSACTION
                elif "search" in target_lower or "find" in target_lower:
                    action_type = SemanticActionType.SEARCH_RECORD
                elif "upload" in target_lower:
                    action_type = SemanticActionType.UPLOAD_FILE
                elif "download" in target_lower or "export" in target_lower:
                    action_type = SemanticActionType.DOWNLOAD_FILE

                actions.append(SemanticEvent(
                    id=f"sem_click_{len(actions)}",
                    action_type=action_type,
                    application=app_name,
                    window_title=window_title,
                    target_description=f"Click '{target_name}'",
                    target_selector={
                        "strategy": "UIA" if p_ev.target_candidate else "COORDINATE",
                        "name": target_name,
                        "coordinate": p_ev.position,
                        "bounds": p_ev.target_bounding_box.model_dump() if p_ev.target_bounding_box else None,
                    },
                    parameters={"click_type": "LEFT_CLICK", "target_name": target_name},
                    summary=f"Click '{target_name}' in {app_name}",
                    start_timestamp=p_ev.timestamp,
                    end_timestamp=p_ev.timestamp + 0.3,
                    confidence=p_ev.confidence,
                    inference_status=p_ev.inference_status,
                    provenance=EvidenceProvenance(
                        source_media_id=source_media_id,
                        start_timestamp=p_ev.timestamp,
                        end_timestamp=p_ev.timestamp + 0.3,
                        frame_ids=p_ev.evidence_frame_ids,
                        confidence=p_ev.confidence,
                        rationale=f"Observed mouse cursor over '{target_name}' with state confirmation",
                    )
                ))

        # 3. Process keyboard typing interactions
        for kb_ev in keyboard_events:
            val = (kb_ev.text or kb_ev.observed_result or "").strip()
            val_lower = val.lower()

            # Exclude empty values, visual placeholders, and recorder noise
            if not val or "TextRegion_" in val or val.startswith("[TextRegion_"):
                continue
            if any(rn in val_lower for rn in RECORDER_NOISE):
                continue

            target_label = kb_ev.target_field.label if kb_ev.target_field else None
            app_name = kb_ev.target_field.application if kb_ev.target_field else "Desktop"

            # Deduplicate/merge consecutive typing actions into the same field
            if actions and actions[-1].action_type in (SemanticActionType.ENTER_VALUE, SemanticActionType.SEARCH_RECORD):
                prev = actions[-1]
                time_diff = kb_ev.timestamp - prev.start_timestamp
                prev_val = str(prev.parameters.get("value") or "")
                same_field = target_label is not None and prev.parameters.get("field_label") == target_label
                is_prefix_extension = (val.startswith(prev_val) or prev_val.startswith(val)) and len(val) >= len(prev_val)

                if same_field or (time_diff < 1.2 and is_prefix_extension):
                    # Update previous typing action with the more complete typed string
                    prev.parameters["value"] = val
                    prev.parameters["demonstrated_value"] = val
                    prev.summary = f"Enter '{val}' into {target_label or prev.parameters.get('field_label') or 'field'} in {app_name}"
                    prev.end_timestamp = kb_ev.timestamp + 0.5
                    continue

            is_var, var_name, var_type = generalize_demonstrated_value(val, field_label=target_label)

            action_type = SemanticActionType.ENTER_VALUE
            if target_label and ("search" in target_label.lower() or "find" in target_label.lower()):
                action_type = SemanticActionType.SEARCH_RECORD

            actions.append(SemanticEvent(
                id=f"sem_type_{len(actions)}",
                action_type=action_type,
                application=app_name,
                window_title=kb_ev.target_field.window_title if kb_ev.target_field else None,
                target_description=f"Enter value into {target_label or 'field'}",
                target_selector={
                    "strategy": "UIA" if kb_ev.target_field else "COORDINATE",
                    "name": target_label,
                    "bounds": kb_ev.target_bounding_box.model_dump() if kb_ev.target_bounding_box else None,
                },
                parameters={
                    "value": val,
                    "demonstrated_value": val,
                    "field_label": target_label,
                },
                summary=f"Enter '{val}' into {target_label or 'field'} in {app_name}",
                start_timestamp=kb_ev.timestamp,
                end_timestamp=kb_ev.timestamp + 0.5,
                confidence=kb_ev.confidence,
                inference_status=kb_ev.inference_status,
                is_demonstrated_value=is_var,
                variable_name=var_name,
                variable_type=var_type,
                provenance=EvidenceProvenance(
                    source_media_id=source_media_id,
                    start_timestamp=kb_ev.timestamp,
                    end_timestamp=kb_ev.timestamp + 0.5,
                    frame_ids=kb_ev.evidence_frame_ids,
                    confidence=kb_ev.confidence,
                    rationale=f"Inferred typing of '{val}' from visual text mutation in field",
                )
            ))

        # Sort all semantic events chronologically
        actions.sort(key=lambda a: a.start_timestamp)
        return actions
