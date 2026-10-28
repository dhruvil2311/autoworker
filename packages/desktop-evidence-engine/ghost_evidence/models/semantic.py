"""Semantic actions, process understanding, ambiguity, and workflow conversion models."""

from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from ghost_evidence.models.observation import InferenceStatus, QualityLevel
from ghost_evidence.models.provenance import EvidenceProvenance


class SemanticActionType(str, Enum):
    # Application / Window control
    OPEN_APPLICATION = "OPEN_APPLICATION"
    SWITCH_APPLICATION = "SWITCH_APPLICATION"
    FOCUS_WINDOW = "FOCUS_WINDOW"
    CLOSE_WINDOW = "CLOSE_WINDOW"

    # Document / File actions
    OPEN_FILE = "OPEN_FILE"
    SAVE_FILE = "SAVE_FILE"
    UPLOAD_FILE = "UPLOAD_FILE"
    DOWNLOAD_FILE = "DOWNLOAD_FILE"

    # Business data operations
    READ_DATA = "READ_DATA"
    READ_FIELD = "READ_FIELD"
    SEARCH_RECORD = "SEARCH_RECORD"
    ENTER_VALUE = "ENTER_VALUE"
    SELECT_OPTION = "SELECT_OPTION"
    COMMIT_RECORD = "COMMIT_RECORD"
    SAVE_TRANSACTION = "SAVE_TRANSACTION"
    NAVIGATE_WEB = "NAVIGATE_WEB"

    # Verification
    VERIFY_STATE = "VERIFY_STATE"
    ASSERT_VALUE = "ASSERT_VALUE"

    # Human intervention
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    # Core interaction aliases
    CLICK = "CLICK"
    TYPE = "TYPE"
    INPUT = "INPUT"
    NAVIGATE = "NAVIGATE"
    SUBMIT = "SUBMIT"
    GENERIC_ACTION = "GENERIC_ACTION"


class SemanticEvent(BaseModel):
    id: str
    action_type: SemanticActionType
    application: str
    window_title: Optional[str] = None
    target_description: str
    target_selector: Dict[str, Any] = Field(default_factory=dict)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    summary: str
    start_timestamp: float
    end_timestamp: float
    confidence: float = 0.9
    inference_status: InferenceStatus = InferenceStatus.INFERRED
    quality_level: QualityLevel = QualityLevel.HIGH_CONFIDENCE
    is_demonstrated_value: bool = False
    variable_name: Optional[str] = None
    variable_type: Optional[str] = None
    preconditions: List[str] = Field(default_factory=list)
    expected_verification: Optional[Dict[str, Any]] = None
    provenance: EvidenceProvenance


class UncertaintyRecord(BaseModel):
    id: str
    uncertainty_type: str  # "LOW_RESOLUTION", "AMBIGUOUS_CLICK", "UNOBSERVABLE_KEYBOARD", "INSUFFICIENT_EVIDENCE"
    description: str
    timestamp: float
    application: Optional[str] = None
    affected_action: Optional[str] = None
    confidence: float
    clarification_question: str
    suggested_options: List[str] = Field(default_factory=list)
    evidence_frame_ids: List[str] = Field(default_factory=list)


class ContradictionRecord(BaseModel):
    id: str
    description: str
    alternatives: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float
    evidence_references: List[str] = Field(default_factory=list)
    suggested_clarification: str


class BusinessProcessUnderstanding(BaseModel):
    task_intent: str
    process_name: str
    description: str
    applications_involved: List[str] = Field(default_factory=list)
    inputs: List[Dict[str, Any]] = Field(default_factory=list)
    outputs: List[Dict[str, Any]] = Field(default_factory=list)
    variables: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    business_rules: List[str] = Field(default_factory=list)
    loops: List[Dict[str, Any]] = Field(default_factory=list)
    conditionals: List[Dict[str, Any]] = Field(default_factory=list)
    semantic_actions: List[SemanticEvent] = Field(default_factory=list)
    uncertainties: List[UncertaintyRecord] = Field(default_factory=list)
    contradictions: List[ContradictionRecord] = Field(default_factory=list)
    overall_confidence: float = 0.85
