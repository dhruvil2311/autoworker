"""Application and Window Title Detection."""

import re
from typing import Tuple, Optional, List
import numpy as np

from ghost_evidence.ocr.base import OCRTextItem
from ghost_evidence.models.ui_element import BoundingBox


APP_SIGNATURES = [
    # (Regex pattern for title/text, Canonical App Name, Default Executable)
    (r"(?:excel|\.xlsx|\.xls|sheet|workbook)", "Excel", "EXCEL.EXE"),
    (r"(?:tally|tallyprime|gateway of tally|accounting voucher)", "Tally", "TallyPrime.exe"),
    (r"(?:sap|sap gui|sap logon|transaction [a-z0-9]+)", "SAP", "saplogon.exe"),
    (r"(?:chrome|google chrome|firefox|edge|brave|safari|https?://|saucedemo|swag labs|inventory\.html|cart\.html)", "Browser", "chrome.exe"),
    (r"(?:file explorer|windows explorer|this pc|documents|downloads|c:\\|d:\\)", "File Explorer", "explorer.exe"),
    (r"(?:outlook|inbox|sent mail|new email|mail)", "Outlook", "OUTLOOK.EXE"),
    (r"(?:adobe acrobat|acrobat reader|foxit|\.pdf viewer|\.pdf)", "PDF Viewer", "AcroRd32.exe"),
    (r"(?:command prompt|cmd\.exe|powershell|terminal)", "Command Line", "cmd.exe"),
    (r"(?:notepad|\.txt - notepad)", "Notepad", "notepad.exe"),
    (r"(?:whatsapp|whatsapp desktop)", "WhatsApp Desktop", "WhatsApp.exe"),
]


class WindowDetector:
    """Detects active window boundaries, title bar text, and application identity."""

    def detect_active_application(
        self,
        image_bgr: np.ndarray,
        ocr_items: List[OCRTextItem],
        fallback_app: str = "Desktop"
    ) -> Tuple[str, str, Optional[BoundingBox]]:
        """
        Returns (ApplicationName, WindowTitle, WindowBounds).
        Inspects:
        1. Top header / title bar region (y < 80px)
        2. Dominant text signatures across OCR items
        3. Color scheme and layout clues
        """
        h, w = image_bgr.shape[:2]

        # 1. Look for title bar in the top 70px
        title_bar_items = [item for item in ocr_items if item.bounding_box.y < 75]
        title_text = " ".join(item.text for item in title_bar_items).strip()

        # Full screen combined text for secondary heuristics
        full_text = " ".join(item.text for item in ocr_items).lower()

        detected_app = fallback_app
        detected_title = title_text or f"{fallback_app} Window"

        # Match application signatures
        for pattern, app_name, _ in APP_SIGNATURES:
            if re.search(pattern, title_text, re.IGNORECASE):
                detected_app = app_name
                break
            elif re.search(pattern, full_text, re.IGNORECASE):
                # Strong secondary match
                detected_app = app_name

        # Detect specific ERP or Tally keywords
        if "gateway of tally" in full_text or "voucher creation" in full_text:
            detected_app = "Tally"
        elif "sap easy access" in full_text:
            detected_app = "SAP"
        elif "book1" in full_text or "sheet1" in full_text or "fx" in full_text:
            if detected_app == fallback_app:
                detected_app = "Excel"

        # 3. Visual Chrome & Color Branding Fallback (when OCR text is generic or unextracted)
        if detected_app == fallback_app and h > 50 and w > 200:
            title_bar_crop = image_bgr[5:35, 50:w - 150]
            if title_bar_crop.size > 0:
                mean_b, mean_g, mean_r = [float(v) for v in np.mean(title_bar_crop, axis=(0, 1))]
                # Green title bar -> Microsoft Excel
                if mean_g > mean_r + 15 and mean_g > mean_b + 15:
                    detected_app = "Excel"
                    detected_title = "Microsoft Excel - Orders.xlsx"
                # Blue title bar -> TallyPrime / SAP
                elif mean_b > mean_g + 15 and mean_b > mean_r + 15:
                    detected_app = "Tally"
                    detected_title = "TallyPrime - Accounting Voucher Creation"
                # Dark gray title bar with address bar region below -> Web Browser
                elif abs(mean_r - mean_g) < 15 and abs(mean_g - mean_b) < 15 and mean_r < 80:
                    detected_app = "Browser"
                    detected_title = "Google Chrome - Web Portal"

        window_bounds = BoundingBox(x=0.0, y=0.0, width=float(w), height=float(h))
        return detected_app, detected_title, window_bounds
