"""Generalization engine distinguishing demonstrated values from dynamic runtime variables."""

import re
from typing import Tuple, Optional, Dict, Any


DATE_PATTERNS = [
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{2}/\d{2}/\d{4}\b",
    r"\b\d{2}-\d{2}-\d{4}\b",
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b",
]

NUMERIC_CURRENCY_PATTERN = r"^\$?\s*[\d,]+(?:\.\d{1,2})?\s*(?:USD|INR|EUR|GBP)?$"


def generalize_demonstrated_value(
    raw_value: str,
    field_label: Optional[str] = None,
    context_desc: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Analyzes an observed text value.
    Returns: (is_demonstrated_value, variable_name, variable_type).
    """
    val = raw_value.strip()
    label_lower = (field_label or "").lower()
    ctx_lower = (context_desc or "").lower()

    # 1. Date variables
    for pat in DATE_PATTERNS:
        if re.search(pat, val, re.IGNORECASE):
            return True, "transaction_date", "date"

    # 2. Monetary Amount / Quantity (takes priority over generic 'invoice' label)
    if any(k in label_lower or k in ctx_lower for k in ["amount", "total", "price", "subtotal", "cost", "refund"]):
        if re.match(NUMERIC_CURRENCY_PATTERN, val):
            return True, "invoice_amount", "number"

    if any(k in label_lower or k in ctx_lower for k in ["qty", "quantity", "count", "units"]):
        if val.isdigit():
            return True, "quantity", "number"

    # 3. Order number / Invoice ID
    if any(k in label_lower or k in ctx_lower for k in ["order", "invoice", "voucher", "reference"]):
        if re.search(r"\b[A-Za-z0-9_-]{3,20}\b", val):
            return True, "order_number", "string"

    # 4. Customer / Vendor name
    if any(k in label_lower or k in ctx_lower for k in ["customer", "client", "vendor", "party", "account name"]):
        return True, "customer_name", "string"

    # 5. Email / Phone
    if "@" in val and "." in val:
        return True, "contact_email", "string"

    # Default: if field has a clear label, generalize to that variable name
    if field_label and len(field_label.strip()) > 1:
        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", field_label.strip().lower()).strip("_")
        val_type = "number" if val.replace(".", "").isdigit() else "string"
        return True, clean_name, val_type

    return False, None, None
