"""Synthetic desktop demonstration video and screenshot generator."""

import os
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple


def draw_window_frame(
    img: np.ndarray,
    title: str,
    bg_color: Tuple[int, int, int] = (240, 240, 240),
    title_bar_color: Tuple[int, int, int] = (60, 60, 60)
):
    """Draws standard desktop window chrome and title bar."""
    h, w = img.shape[:2]
    # Background
    img[:] = bg_color
    # Title bar
    cv2.rectangle(img, (0, 0), (w, 40), title_bar_color, -1)
    # Title text
    cv2.putText(img, title, (20, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
    # Window controls (min, max, close)
    cv2.rectangle(img, (w - 35, 10), (w - 15, 30), (0, 0, 200), -1)
    cv2.rectangle(img, (w - 70, 10), (w - 50, 30), (120, 120, 120), -1)
    cv2.rectangle(img, (w - 105, 10), (w - 85, 30), (120, 120, 120), -1)


def draw_excel_scene(img: np.ndarray, selected_cell: str = "A2", cursor_pos: Tuple[int, int] = (150, 120)):
    """Renders Microsoft Excel spreadsheet scene."""
    draw_window_frame(img, "Microsoft Excel - Orders_2026.xlsx", bg_color=(255, 255, 255), title_bar_color=(34, 114, 73))
    h, w = img.shape[:2]

    # Ribbon bar
    cv2.rectangle(img, (0, 40), (w, 80), (243, 242, 241), -1)
    cv2.putText(img, "Home   Insert   Data   Formulas", (20, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 50, 50), 1)

    # Grid headers
    col_w = 140
    row_h = 30
    start_y = 100

    headers = ["Order ID", "Customer", "Amount", "Status"]
    for i, hdr in enumerate(headers):
        x = 50 + i * col_w
        cv2.rectangle(img, (x, start_y), (x + col_w, start_y + row_h), (230, 230, 230), -1)
        cv2.rectangle(img, (x, start_y), (x + col_w, start_y + row_h), (180, 180, 180), 1)
        cv2.putText(img, hdr, (x + 10, start_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    # Row 1 data
    rows = [
        ["ORD-901", "Acme Corp", "5000", "Pending"],
        ["ORD-902", "Globex", "1250", "Approved"],
        ["ORD-903", "Initech", "3400", "Pending"],
    ]
    for r_idx, row_vals in enumerate(rows):
        y = start_y + (r_idx + 1) * row_h
        for c_idx, val in enumerate(row_vals):
            x = 50 + c_idx * col_w
            # Draw cell
            cv2.rectangle(img, (x, y), (x + col_w, y + row_h), (255, 255, 255), -1)
            cv2.rectangle(img, (x, y), (x + col_w, y + row_h), (210, 210, 210), 1)
            cv2.putText(img, val, (x + 10, y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1)

    # Draw cursor
    cx, cy = cursor_pos
    draw_cursor(img, cx, cy)


def draw_erp_scene(img: np.ndarray, customer: str = "Acme Corp", amount: str = "5000", cursor_pos: Tuple[int, int] = (420, 260)):
    """Renders Desktop ERP / Tally accounting scene."""
    draw_window_frame(img, "TallyPrime - Accounting Voucher Creation", bg_color=(245, 245, 250), title_bar_color=(24, 76, 140))
    h, w = img.shape[:2]

    # Sub-header
    cv2.rectangle(img, (20, 60), (w - 20, 95), (220, 230, 245), -1)
    cv2.putText(img, "Gateway of Tally > Accounting Vouchers > Invoice Entry", (30, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 40, 80), 1)

    # Form Fields
    # 1. Customer field
    cv2.putText(img, "Party Account Name:", (50, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)
    cv2.rectangle(img, (230, 120), (500, 155), (255, 255, 255), -1)
    cv2.rectangle(img, (230, 120), (500, 155), (100, 100, 150), 2)
    cv2.putText(img, customer, (240, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 120), 1)

    # 2. Amount field
    cv2.putText(img, "Invoice Amount:", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)
    cv2.rectangle(img, (230, 180), (400, 215), (255, 255, 255), -1)
    cv2.rectangle(img, (230, 180), (400, 215), (100, 100, 150), 2)
    cv2.putText(img, amount, (240, 205), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 120), 1)

    # Save button
    cv2.rectangle(img, (230, 250), (350, 290), (34, 139, 34), -1)
    cv2.putText(img, "Save", (265, 276), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

    # Cancel button
    cv2.rectangle(img, (370, 250), (470, 290), (180, 60, 60), -1)
    cv2.putText(img, "Cancel", (390, 276), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Draw cursor
    cx, cy = cursor_pos
    draw_cursor(img, cx, cy)


def draw_browser_scene(img: np.ndarray, url: str = "https://portal.company.com/invoices", cursor_pos: Tuple[int, int] = (300, 250)):
    """Renders Browser window scene."""
    draw_window_frame(img, "Company Invoices Portal - Google Chrome", bg_color=(250, 250, 250), title_bar_color=(50, 50, 50))
    h, w = img.shape[:2]

    # Address bar
    cv2.rectangle(img, (50, 50), (w - 50, 80), (255, 255, 255), -1)
    cv2.rectangle(img, (50, 50), (w - 50, 80), (200, 200, 200), 1)
    cv2.putText(img, url, (65, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 60, 60), 1)

    # Portal content
    cv2.putText(img, "Upload Invoices", (60, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
    cv2.rectangle(img, (60, 170), (220, 215), (0, 120, 215), -1)
    cv2.putText(img, "Upload", (95, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

    # Draw cursor
    cx, cy = cursor_pos
    draw_cursor(img, cx, cy)


def draw_cursor(img: np.ndarray, x: int, y: int):
    """Draws a visible arrow cursor pointer."""
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        pts = np.array([[x, y], [x + 12, y + 16], [x + 6, y + 16], [x + 10, y + 26], [x + 6, y + 27], [x + 2, y + 18], [x - 2, y + 21]], np.int32)
        cv2.fillPoly(img, [pts], (255, 255, 255))
        cv2.polylines(img, [pts], True, (0, 0, 0), 1)


def generate_synthetic_cross_app_video(output_path: str, fps: float = 10.0):
    """
    Generates a full synthetic video demonstrating the canonical cross-application workflow:
    1. Open Excel -> Read Order & Amount
    2. Switch to Tally / ERP -> Search Customer -> Enter Amount -> Click Save
    3. Switch to Browser -> Navigate Portal -> Upload Invoice -> Confirmation
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    width, height = 800, 600

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # Phase 1: Excel (Frames 0 to 20: 2 seconds)
    for i in range(20):
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Mouse moves toward order cell
        cursor_x = 100 + int(i * 5)
        cursor_y = 100 + int(i * 3)
        draw_excel_scene(img, selected_cell="A2", cursor_pos=(cursor_x, cursor_y))
        out.write(img)

    # Phase 2: Switch to Tally/ERP (Frames 20 to 50: 3 seconds)
    for i in range(30):
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Mouse enters customer and amount, then moves to Save button
        cursor_x = 250 + int(i * 1.5)
        cursor_y = 140 + int(i * 4)
        draw_erp_scene(img, customer="Acme Corp", amount="5000", cursor_pos=(cursor_x, cursor_y))
        out.write(img)

    # Phase 3: Switch to Browser (Frames 50 to 80: 3 seconds)
    for i in range(30):
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Mouse clicks Upload button
        cursor_x = 200 - int(i * 2)
        cursor_y = 150 + int(i * 1.5)
        draw_browser_scene(img, url="https://portal.company.com/invoices", cursor_pos=(cursor_x, cursor_y))
        out.write(img)

    out.release()
    return output_path


def generate_synthetic_screenshot(output_path: str, app_type: str = "Excel"):
    """Generates an independent screenshot for Excel, ERP, or Browser."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    width, height = 800, 600
    img = np.zeros((height, width, 3), dtype=np.uint8)

    if app_type.lower() == "excel":
        draw_excel_scene(img, cursor_pos=(200, 130))
    elif app_type.lower() == "erp" or app_type.lower() == "tally":
        draw_erp_scene(img, customer="Acme Corp", amount="5000", cursor_pos=(280, 270))
    else:
        draw_browser_scene(img, cursor_pos=(140, 190))

    cv2.imwrite(output_path, img, [cv2.IMWRITE_PNG_COMPRESSION, 4])
    return output_path


if __name__ == "__main__":
    import sys
    out_file = sys.argv[1] if len(sys.argv) > 1 else "demo_video.mp4"
    generate_synthetic_cross_app_video(out_file)
    print(f"Synthetic video generated at: {out_file}")
