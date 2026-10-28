import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface MouseActionRecord {
  type: "move" | "click" | "double_click" | "right_click" | "mouse_down" | "mouse_up" | "drag" | "scroll";
  x: number;
  y: number;
  delta?: number;
  timestamp: string;
}

export class MouseController {
  private isWindows = process.platform === "win32";
  public actionHistory: MouseActionRecord[] = [];
  public currentPosition: { x: number; y: number } = { x: 0, y: 0 };

  async move(x: number, y: number): Promise<void> {
    this.currentPosition = { x, y };
    this.record("move", x, y);

    if (this.isWindows) {
      try {
        const psCommand = `powershell -NoProfile -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})"`;
        await execAsync(psCommand);
      } catch {
        // Fallback or non-interactive mode
      }
    }
  }

  async click(x?: number, y?: number): Promise<void> {
    const targetX = x ?? this.currentPosition.x;
    const targetY = y ?? this.currentPosition.y;
    await this.move(targetX, targetY);
    this.record("click", targetX, targetY);

    if (this.isWindows) {
      try {
        const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class MouseWin32 {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
  }
"@
[MouseWin32]::mouse_event(0x02, 0, 0, 0, 0)
[MouseWin32]::mouse_event(0x04, 0, 0, 0, 0)
`;
        const encoded = Buffer.from(psScript, "utf16le").toString("base64");
        await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      } catch {}
    }
  }

  async doubleClick(x?: number, y?: number): Promise<void> {
    const targetX = x ?? this.currentPosition.x;
    const targetY = y ?? this.currentPosition.y;
    await this.click(targetX, targetY);
    await new Promise(r => setTimeout(r, 80));
    await this.click(targetX, targetY);
    this.record("double_click", targetX, targetY);
  }

  async rightClick(x?: number, y?: number): Promise<void> {
    const targetX = x ?? this.currentPosition.x;
    const targetY = y ?? this.currentPosition.y;
    await this.move(targetX, targetY);
    this.record("right_click", targetX, targetY);

    if (this.isWindows) {
      try {
        const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class MouseWin32 {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
  }
"@
[MouseWin32]::mouse_event(0x08, 0, 0, 0, 0)
[MouseWin32]::mouse_event(0x10, 0, 0, 0, 0)
`;
        const encoded = Buffer.from(psScript, "utf16le").toString("base64");
        await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      } catch {}
    }
  }

  async mouseDown(x?: number, y?: number): Promise<void> {
    const targetX = x ?? this.currentPosition.x;
    const targetY = y ?? this.currentPosition.y;
    await this.move(targetX, targetY);
    this.record("mouse_down", targetX, targetY);
  }

  async mouseUp(x?: number, y?: number): Promise<void> {
    const targetX = x ?? this.currentPosition.x;
    const targetY = y ?? this.currentPosition.y;
    await this.move(targetX, targetY);
    this.record("mouse_up", targetX, targetY);
  }

  async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await this.move(from.x, from.y);
    await this.mouseDown(from.x, from.y);
    await new Promise(r => setTimeout(r, 100));
    await this.move(to.x, to.y);
    await this.mouseUp(to.x, to.y);
    this.record("drag", to.x, to.y);
  }

  async scroll(delta: number): Promise<void> {
    this.record("scroll", this.currentPosition.x, this.currentPosition.y, delta);

    if (this.isWindows) {
      try {
        const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class MouseWin32 {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
  }
"@
[MouseWin32]::mouse_event(0x0800, 0, 0, ${Math.round(delta)}, 0)
`;
        const encoded = Buffer.from(psScript, "utf16le").toString("base64");
        await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      } catch {}
    }
  }

  private record(type: MouseActionRecord["type"], x: number, y: number, delta?: number) {
    this.actionHistory.push({
      type,
      x,
      y,
      ...(delta !== undefined ? { delta } : {}),
      timestamp: new Date().toISOString()
    });
  }
}
