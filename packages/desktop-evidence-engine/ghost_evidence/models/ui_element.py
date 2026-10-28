"""UI Element models for desktop visual detection."""

from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class UIElementType(str, Enum):
    BUTTON = "BUTTON"
    TEXTBOX = "TEXTBOX"
    INPUT = "INPUT"
    CHECKBOX = "CHECKBOX"
    RADIO = "RADIO"
    DROPDOWN = "DROPDOWN"
    TAB = "TAB"
    MENU = "MENU"
    MENU_ITEM = "MENU_ITEM"
    TABLE = "TABLE"
    ROW = "ROW"
    COLUMN = "COLUMN"
    CELL = "CELL"
    DIALOG = "DIALOG"
    MODAL = "MODAL"
    NAVIGATION = "NAVIGATION"
    TOOLBAR = "TOOLBAR"
    ICON = "ICON"
    LINK = "LINK"
    FILE = "FILE"
    WINDOW = "WINDOW"
    LABEL = "LABEL"
    UNKNOWN = "UNKNOWN"


class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2.0

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2.0

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    def contains(self, px: float, py: float) -> bool:
        return self.x <= px <= self.right and self.y <= py <= self.bottom

    def distance_to(self, other: "BoundingBox") -> float:
        dx = self.center_x - other.center_x
        dy = self.center_y - other.center_y
        return (dx * dx + dy * dy) ** 0.5


class UIElement(BaseModel):
    id: str
    element_type: UIElementType
    text: Optional[str] = None
    label: Optional[str] = None
    value: Optional[str] = None
    bounding_box: BoundingBox
    confidence: float = 1.0
    timestamp: float = 0.0
    active: bool = True
    focused: bool = False
    parent_id: Optional[str] = None
    children_ids: List[str] = Field(default_factory=list)
    attributes: Dict[str, Any] = Field(default_factory=dict)
    application: Optional[str] = None
    window_title: Optional[str] = None
