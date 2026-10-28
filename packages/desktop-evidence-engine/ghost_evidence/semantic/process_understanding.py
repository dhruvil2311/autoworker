"""Business process understanding, loop detection, conditionals, and verification."""

from typing import List, Dict, Any, Optional
from ghost_evidence.models.semantic import (
    SemanticEvent,
    SemanticActionType,
    BusinessProcessUnderstanding,
    UncertaintyRecord,
    ContradictionRecord,
)
from ghost_evidence.models.timeline import DesktopState
from ghost_evidence.semantic.ambiguity import AmbiguityEngine


class ProcessUnderstandingEngine:
    """Synthesizes reconstructed semantic events into a coherent Business Process Understanding."""

    def __init__(self):
        self.ambiguity_engine = AmbiguityEngine()

    def infer_process(
        self,
        semantic_actions: List[SemanticEvent],
        states: List[DesktopState],
        raw_observations: List[Dict[str, Any]]
    ) -> BusinessProcessUnderstanding:
        apps_involved = sorted(list({a.application for a in semantic_actions if a.application}))

        # 1. Infer task intent from sequence of applications and key verbs
        task_intent = self._infer_task_intent(semantic_actions, apps_involved)
        process_name = self._generate_process_name(task_intent, apps_involved)

        # 2. Extract inputs & variables
        inputs: List[Dict[str, Any]] = []
        variables: Dict[str, Dict[str, Any]] = {}

        for act in semantic_actions:
            if act.is_demonstrated_value and act.variable_name:
                var_name = act.variable_name
                if var_name not in variables:
                    variables[var_name] = {
                        "name": var_name,
                        "type": act.variable_type or "string",
                        "demonstrated_value": act.parameters.get("demonstrated_value"),
                        "description": f"Variable derived from {act.application} ({act.target_description})",
                    }
                    inputs.append({
                        "name": var_name,
                        "type": act.variable_type or "string",
                        "required": True,
                        "default_value": act.parameters.get("demonstrated_value"),
                    })

        # 3. Detect loops (repeated action sub-sequences)
        loops = self._detect_loops(semantic_actions)

        # 4. Detect conditionals / branch points
        conditionals = self._detect_conditionals(semantic_actions, states)

        # 5. Generate state-based verifications for critical actions
        for act in semantic_actions:
            act.expected_verification = self._generate_verification(act)

        # 6. Detect ambiguities and contradictions
        uncertainties: List[UncertaintyRecord] = []
        seen_question_keys = set()
        for act in semantic_actions:
            unc = self.ambiguity_engine.evaluate_action_ambiguity(
                action_name=act.summary,
                confidence=act.confidence,
                timestamp=act.start_timestamp,
                application=act.application,
                evidence_frames=act.provenance.frame_ids,
            )
            if unc:
                key = (unc.application, unc.description)
                if key not in seen_question_keys and len(uncertainties) < 3:
                    seen_question_keys.add(key)
                    uncertainties.append(unc)

        contradictions = self.ambiguity_engine.detect_contradictions(raw_observations)

        # 7. Business rules are not inferred from which applications appear on screen; rules come
        # only from explicit evidence or the user's instructions, never from templates.
        business_rules: List[str] = []

        avg_confidence = (
            sum(a.confidence for a in semantic_actions) / len(semantic_actions)
            if semantic_actions else 0.85
        )

        return BusinessProcessUnderstanding(
            task_intent=task_intent,
            process_name=process_name,
            description=f"Automated workflow across {', '.join(apps_involved)} to {task_intent.lower()}.",
            applications_involved=apps_involved,
            inputs=inputs,
            outputs=[{
                "type": "ACTION_CONFIRMATION",
                "description": f"Confirmation of completed task '{task_intent}' across {len(semantic_actions)} steps.",
            }],
            variables=variables,
            business_rules=business_rules,
            loops=loops,
            conditionals=conditionals,
            semantic_actions=semantic_actions,
            uncertainties=uncertainties,
            contradictions=contradictions,
            overall_confidence=round(avg_confidence, 2),
        )

    def _infer_task_intent(self, actions: List[SemanticEvent], apps: List[str]) -> str:
        # The set of applications on screen does not reveal the user's goal. Report only that a
        # procedure was observed; the goal must come from the user or from grounded reasoning.
        app_str = " -> ".join(apps) if apps else "Desktop Task"
        return f"Autonomous multi-step procedure across {app_str}"

    def _generate_process_name(self, intent: str, apps: List[str]) -> str:
        if "order" in intent.lower():
            return "Customer Order Processing"
        elif "voucher" in intent.lower() or "invoice" in intent.lower():
            return "Invoice Entry & Verification"
        return f"Desktop Process ({' + '.join(apps) if apps else 'General'})"

    def _detect_loops(self, actions: List[SemanticEvent]) -> List[Dict[str, Any]]:
        """Detects sequential repeating patterns of actions (e.g. A -> B -> C -> A -> B -> C)."""
        loops: List[Dict[str, Any]] = []
        action_names = [a.action_type.value for a in actions]
        n = len(action_names)

        # Look for pattern lengths from 2 to n // 2
        for pattern_len in range(2, max(3, n // 2 + 1)):
            for start in range(n - 2 * pattern_len + 1):
                sub1 = action_names[start:start + pattern_len]
                sub2 = action_names[start + pattern_len:start + 2 * pattern_len]
                if sub1 == sub2:
                    loops.append({
                        "pattern_length": pattern_len,
                        "repetition_count": 2,
                        "actions": sub1,
                        "start_step_index": start,
                        "confidence": 0.88,
                        "description": f"Repeat sequence of {pattern_len} steps for each item/order",
                    })
                    break
        return loops

    def _detect_conditionals(
        self,
        actions: List[SemanticEvent],
        states: List[DesktopState]
    ) -> List[Dict[str, Any]]:
        """Detects conditional branch points like popup dismissal or approval dialogs."""
        conditionals: List[Dict[str, Any]] = []

        for st in states:
            if st.active_dialog:
                conditionals.append({
                    "condition": f"If dialog '{st.active_dialog}' appears",
                    "action": "Dismiss dialog or confirm prompt",
                    "timestamp": st.timestamp,
                    "confidence": 0.90,
                })

        for act in actions:
            if act.action_type == SemanticActionType.REQUIRE_APPROVAL:
                conditionals.append({
                    "condition": "If transaction value exceeds policy threshold",
                    "action": "Pause for human operator approval",
                    "timestamp": act.start_timestamp,
                    "confidence": 0.95,
                })

        return conditionals

    def _generate_verification(self, action: SemanticEvent) -> Dict[str, Any]:
        """Generates state-based post-condition verification predicates."""
        act_type = action.action_type

        if act_type == SemanticActionType.OPEN_APPLICATION or act_type == SemanticActionType.SWITCH_APPLICATION:
            return {
                "type": "window_exists",
                "application": action.application,
                "timeoutMs": 5000,
                "description": f"Verify {action.application} window is focused and active",
            }
        elif act_type == SemanticActionType.SAVE_TRANSACTION:
            return {
                "type": "text_contains",
                "expectedValue": "Success",
                "timeoutMs": 6000,
                "description": f"Verify confirmation message or saved status in {action.application}",
            }
        elif act_type == SemanticActionType.ENTER_VALUE:
            return {
                "type": "value_equals",
                "target": action.target_selector,
                "expectedValue": action.parameters.get("value"),
                "timeoutMs": 3000,
                "description": "Verify field contains the entered value",
            }
        elif act_type == SemanticActionType.UPLOAD_FILE:
            return {
                "type": "element_visible",
                "expectedValue": "Uploaded",
                "timeoutMs": 8000,
                "description": "Verify file upload completion indicator",
            }

        return {
            "type": "screenshot_changed",
            "timeoutMs": 2000,
            "description": "Verify screen visual update following user action",
        }
