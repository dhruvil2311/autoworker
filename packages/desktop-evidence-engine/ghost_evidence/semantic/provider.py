"""Semantic Reasoning Provider Abstraction and Implementations.
Supports Multimodal LLM (OpenRouter, Gemini, OpenAI) and Deterministic/Local Reasoning when offline or rate-limited.
"""

import os
import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from ghost_evidence.models.semantic import SemanticEvent, SemanticActionType, BusinessProcessUnderstanding
from ghost_evidence.models.timeline import DesktopState
from ghost_evidence.models.observation import InferenceStatus, QualityLevel
from ghost_evidence.models.provenance import EvidenceProvenance

logger = logging.getLogger("ghost_evidence.semantic.provider")


class SemanticReasoningProvider(ABC):
    """Abstract provider for high-level semantic process understanding."""

    @abstractmethod
    def reason_process(
        self,
        media_id: str,
        states: List[DesktopState],
        raw_actions: List[SemanticEvent],
        all_ocr_texts: List[str],
        key_frame_paths: List[str],
    ) -> Dict[str, Any]:
        """Returns structured JSON representation of the business task, actions, variables, and verifications."""
        pass


class DeterministicSemanticReasoningProvider(SemanticReasoningProvider):
    """
    Robust deterministic reasoning provider.
    Used when external LLMs are rate-limited, unavailable, or for offline/deterministic testing.
    Synthesizes intent, variables, and structured workflow actions directly from
    rich visual transitions, OCR mutations, and UI element interactions.
    """

    def reason_process(
        self,
        media_id: str,
        states: List[DesktopState],
        raw_actions: List[SemanticEvent],
        all_ocr_texts: List[str],
        key_frame_paths: List[str],
    ) -> Dict[str, Any]:
        import re

        # 1. Detect target URL and applications dynamically from observed frames
        apps_set = set()
        urls = []
        for s in states:
            app = s.active_application
            if app:
                apps_set.add(app)
            for e in s.visible_elements:
                txt = str(e.text or '')
                m = re.search(r'(https?://[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|edu|gov)(?:/[^\s]*)?)', txt)
                if m:
                    u = m.group(1).rstrip('.,;:')
                    if not any(ign in u.lower() for ign in ['localhost:5173', 'localhost:4000', '127.0.0.1']):
                        urls.append(u)

        detected_url = None
        if urls:
            # Pick the most prevalent legitimate URL
            from collections import Counter
            url_counts = Counter(urls)
            detected_url = url_counts.most_common(1)[0][0]
            if not detected_url.startswith('http'):
                detected_url = 'https://' + detected_url

        apps_involved = sorted(list(apps_set)) or ['Browser']

        # 2. Dynamic Task & Description Generation
        task_name = f"Automated Task across {', '.join(apps_involved)}"
        if detected_url:
            domain = re.sub(r'^https?://(?:www\.)?', '', detected_url).split('/')[0]
            task_name = f"Automated Workflow on {domain}"
        elif states and (getattr(states[0], "active_window_title", None) or getattr(states[0], "window_title", None)):
            raw_title = getattr(states[0], "active_window_title", None) or getattr(states[0], "window_title", "")
            clean_title = re.sub(r'[\r\n\t]+', ' ', raw_title).strip()[:50]
            task_name = f"Process for {clean_title}"

        description = f"Autonomous workflow reconstructed dynamically from recorded screen demonstration across {', '.join(apps_involved)}."

        actions = []
        variables = []
        expected_results = []

        # 3. Dynamic Initial Navigation if Web Application
        if detected_url:
            actions.append({
                "id": "step_0_navigate",
                "action_type": "NAVIGATE",
                "application": "Browser",
                "target_description": f"Open {detected_url}",
                "target_selector": {"strategy": "CSS", "selector": "body"},
                "parameters": {"url": detected_url, "application": "Browser"},
                "summary": f"Open {detected_url}",
                "start_timestamp": 0.0,
                "end_timestamp": 1.0,
                "confidence": 0.95,
                "evidence_status": "OBSERVED",
                "provenance": {"frame_ids": [states[0].frame_id] if states else ["frame_000000"]}
            })

        # 4. Synthesize Granular Operational Actions from Raw Video Evidence
        seen_actions = set()
        step_idx = len(actions)

        RECORDER_NOISE = {
            "autoworker", "localhost:5173", "localhost:4000", "127.0.0.1",
            "stop sharing", "stop recording", "is sharing your screen", "hide",
            "teaching workspace", "evidence viewer", "run inspector", "new tab",
            "al engineering roadmap", "ask gemini", "chatgpt"
        }

        for act in raw_actions:
            val = str(act.parameters.get("value") or "").strip()
            desc = str(act.summary or act.target_description or "").strip()
            val_lower = val.lower()
            desc_lower = desc.lower()

            # Skip OCR visual artifacts and recorder/browser chrome noise
            if "textregion_" in val_lower or "textregion_" in desc_lower:
                continue
            if any(n in val_lower for n in RECORDER_NOISE) or any(n in desc_lower for n in RECORDER_NOISE):
                continue
            # Skip actions trying to enter full URLs into fields unless explicitly in an address bar
            if act.action_type.value == "ENTER_VALUE" and (val.startswith("http://") or val.startswith("https://") or "localhost:" in val):
                continue

            act_key = (act.action_type.value, desc, val)
            if act_key in seen_actions:
                continue
            seen_actions.add(act_key)

            act_dict = act.model_dump()
            act_dict["id"] = f"step_{step_idx}_{act.action_type.value.lower()}"
            step_idx += 1
            actions.append(act_dict)

            if act.is_demonstrated_value and act.variable_name:
                variables.append({
                    "name": act.variable_name,
                    "type": act.variable_type or "string",
                    "default_value": val,
                    "description": f"Variable derived from {act.target_description}",
                    "status": "INFERRED"
                })

        # 5. Extract Verification Milestones from Significant State Changes
        prev_heading = None
        for s in states:
            headings = [e.text for e in s.visible_elements if e.text and len(e.text) > 3 and getattr(e, 'bounding_box', None) and getattr(e.bounding_box, 'y', 1000) < 300]
            if headings:
                current_heading = headings[0]
                if current_heading != prev_heading and prev_heading is not None:
                    expected_results.append({
                        "condition": f"State transition to '{current_heading}'",
                        "verification": f"Page contains '{current_heading}'",
                        "status": "OBSERVED"
                    })
                prev_heading = current_heading

        return {
            "task": task_name,
            "description": description,
            "applications": apps_involved,
            "detected_url": detected_url,
            "actions": actions,
            "variables": variables,
            "conditions": [],
            "loops": [],
            "expected_results": expected_results,
            "uncertainties": [],
            "evidence": {
                "media_id": media_id,
                "keyframes_count": len(key_frame_paths),
                "states_count": len(states),
                "total_actions": len(actions)
            }
        }


class LLMSemanticReasoningProvider(SemanticReasoningProvider):
    """
    Multimodal LLM Semantic Reasoner (OpenRouter, Gemini, OpenAI).
    Sends ONLY compact keyframe representations and OCR summaries.
    Falls back gracefully to Deterministic provider on rate limit or network failure.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY") or os.environ.get("GEMINI_API_KEY")
        self.base_url = base_url or os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.model = model or os.environ.get("REASONING_MODEL", "google/gemini-2.0-flash-001")
        self.fallback = DeterministicSemanticReasoningProvider()

    def reason_process(
        self,
        media_id: str,
        states: List[DesktopState],
        raw_actions: List[SemanticEvent],
        all_ocr_texts: List[str],
        key_frame_paths: List[str],
    ) -> Dict[str, Any]:
        if not self.api_key:
            return self.fallback.reason_process(media_id, states, raw_actions, all_ocr_texts, key_frame_paths)

        try:
            import urllib.request

            # Prepare compact structured prompt
            action_summaries = [f"- [{a.action_type.value}] {a.summary} (timestamp: {a.start_timestamp}s)" for a in raw_actions[:25]]
            sample_texts = all_ocr_texts[:35]

            prompt = {
                "role": "user",
                "content": f"""Analyze this UI demonstration evidence and synthesize a structured business process model.
Key Actions Observed:
{chr(10).join(action_summaries)}

Key OCR Text Observed:
{', '.join(sample_texts[:25])}

Return ONLY valid JSON matching this schema:
{{
  "task": "Title of the task",
  "description": "High level description of what was done",
  "applications": ["App1", "App2"],
  "actions": [
    {{
      "action_type": "CLICK|TYPE|NAVIGATE|EXTRACT|SUBMIT",
      "target_description": "element or field description",
      "value": "optional value if typed",
      "summary": "description of the action",
      "evidence_status": "OBSERVED|INFERRED"
    }}
  ],
  "variables": [
    {{
      "name": "variable_name",
      "type": "string|number",
      "default_value": "value"
    }}
  ],
  "expected_results": [
    {{ "condition": "...", "verification": "..." }}
  ]
}}"""
            }

            req = urllib.request.Request(
                f"{self.base_url.rstrip('/')}/chat/completions",
                data=json.dumps({
                    "model": self.model,
                    "messages": [prompt],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 2048,
                    "temperature": 0.1
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                parsed["evidence"] = {
                    "media_id": media_id,
                    "keyframes_count": len(key_frame_paths),
                    "model_used": self.model
                }
                return parsed

        except Exception as e:
            logger.warning(f"LLM semantic reasoning failed or rate-limited ({e}), using deterministic state reasoning")
            return self.fallback.reason_process(media_id, states, raw_actions, all_ocr_texts, key_frame_paths)
