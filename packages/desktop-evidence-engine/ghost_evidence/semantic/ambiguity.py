"""Ambiguity and Contradiction detection engine."""

from typing import List, Dict, Any, Optional
from ghost_evidence.models.semantic import UncertaintyRecord, ContradictionRecord
from ghost_evidence.models.observation import QualityLevel, InferenceStatus


import re

def clean_action_label(text: str) -> str:
    if not text:
        return "desktop interaction"
    cleaned = re.sub(r"\[TextRegion_[^\]]+\]", "field", text)
    cleaned = re.sub(r"\[Region_[^\]]+\]", "control", cleaned)
    cleaned = re.sub(r"[\w\-_]+\.(webm|mp4|png|jpg|jpeg|json)", "demonstration", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class AmbiguityEngine:
    """Detects missing evidence, low-confidence actions, and conflicting facts."""

    def evaluate_action_ambiguity(
        self,
        action_name: str,
        confidence: float,
        timestamp: float,
        application: str,
        evidence_frames: List[str],
        context_reason: Optional[str] = None
    ) -> Optional[UncertaintyRecord]:
        """Flags actions that cannot be asserted with high confidence."""
        if confidence < 0.80:
            app = application or "Desktop"
            clean_name = clean_action_label(action_name)
            lower = clean_name.lower()

            if "enter" in lower or "type" in lower or "input" in lower or "field" in lower:
                question = f"In {app}, what specific value or business rule should be used when entering data here?"
                desc = f"Confirm input value for data entry step in {app}"
            elif "save" in lower or "submit" in lower or "commit" in lower:
                question = f"In {app}, does this transaction require supervisor confirmation before saving or submitting (save)?"
                desc = f"Confirm transaction submission policy in {app}"
            elif "search" in lower or "filter" in lower:
                question = f"In {app}, what criteria should be used to search for records?"
                desc = f"Confirm search / filter criteria in {app}"
            elif "click" in lower:
                question = f"In {app}, please confirm if clicking this button is always required or conditional."
                desc = f"Clarify button interaction in {app}"
            else:
                question = f"In {app}, please clarify the exact business outcome intended at this step."
                desc = f"Clarify procedural step in {app}"

            return UncertaintyRecord(
                id=f"unc_{timestamp:.1f}_{app.lower()}",
                uncertainty_type="LOW_CONFIDENCE_ACTION",
                description=desc,
                timestamp=timestamp,
                application=app,
                affected_action=clean_name,
                confidence=confidence,
                clarification_question=question,
                suggested_options=["Confirm and proceed", "Optional step", "Skip when not applicable"],
                evidence_frame_ids=evidence_frames,
            )
        return None

    def detect_contradictions(
        self,
        actions_or_observations: List[Dict[str, Any]]
    ) -> List[ContradictionRecord]:
        """Detects contradictory observations across the demonstration."""
        contradictions: List[ContradictionRecord] = []

        # Example: same field typed with conflicting values or multiple conflicting target buttons
        targets_by_intent: Dict[str, List[Dict[str, Any]]] = {}
        for item in actions_or_observations:
            intent = item.get("intent") or item.get("action_type")
            if intent:
                targets_by_intent.setdefault(str(intent), []).append(item)

        for intent, occurrences in targets_by_intent.items():
            if len(occurrences) > 1:
                # Check if target selectors or apps differed unexpectedly without loop context
                apps = {o.get("application") for o in occurrences if o.get("application")}
                if len(apps) > 1 and "SWITCH" not in intent and "OPEN" not in intent:
                    contradictions.append(ContradictionRecord(
                        id=f"contra_{intent}",
                        description=f"Action '{intent}' was observed across multiple different applications: {list(apps)}",
                        alternatives=[{"application": o.get("application"), "timestamp": o.get("timestamp")} for o in occurrences],
                        confidence=0.75,
                        evidence_references=[str(o.get("frame_id")) for o in occurrences if o.get("frame_id")],
                        suggested_clarification=f"Did you intend to perform '{intent}' in {list(apps)[0]} or {list(apps)[-1]}?",
                    ))

        return contradictions
