import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface KeyboardActionRecord {
  type: "type" | "key_press" | "hotkey";
  text?: string;
  key?: string;
  hotkey?: string[];
  timestamp: string;
}

export class KeyboardController {
  private isWindows = process.platform === "win32";
  public actionHistory: KeyboardActionRecord[] = [];

  async type(text: string): Promise<void> {
    this.record({ type: "type", text });

    if (this.isWindows) {
      try {
        // SendKeys via PowerShell
        // Escape special SendKeys characters: +, ^, %, ~, (, ), {, }, [, ]
        const escaped = text
          .replace(/{/g, "{{}")
          .replace(/}/g, "{}}")
          .replace(/\+/g, "{+}")
          .replace(/\^/g, "{^}")
          .replace(/%/g, "{%}")
          .replace(/~/g, "{~}")
          .replace(/\(/g, "{(}")
          .replace(/\)/g, "{)}")
          .replace(/\[/g, "{[}")
          .replace(/\]/g, "{]}");

        const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`;
        await execAsync(psCommand);
      } catch {}
    }
  }

  async keyPress(key: string): Promise<void> {
    this.record({ type: "key_press", key });

    if (this.isWindows) {
      try {
        let sendKeyVal = key;
        const map: Record<string, string> = {
          Enter: "{ENTER}",
          Tab: "{TAB}",
          Escape: "{ESC}",
          Backspace: "{BACKSPACE}",
          Delete: "{DELETE}",
          ArrowUp: "{UP}",
          ArrowDown: "{DOWN}",
          ArrowLeft: "{LEFT}",
          ArrowRight: "{RIGHT}",
          Home: "{HOME}",
          End: "{END}",
          PageUp: "{PGUP}",
          PageDown: "{PGDN}",
          Space: " "
        };
        if (map[key]) {
          sendKeyVal = map[key]!;
        }

        const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeyVal}')"`;
        await execAsync(psCommand);
      } catch {}
    }
  }

  async hotkey(keys: string[]): Promise<void> {
    this.record({ type: "hotkey", hotkey: keys });

    if (this.isWindows) {
      try {
        // Convert hotkey array like ["Ctrl", "Shift", "S"] to SendKeys format: ^+s
        let prefix = "";
        let mainKey = "";
        for (const k of keys) {
          const lk = k.toLowerCase();
          if (lk === "ctrl" || lk === "control") prefix += "^";
          else if (lk === "shift") prefix += "+";
          else if (lk === "alt") prefix += "%";
          else mainKey = k.toLowerCase();
        }
        const sendKeyVal = `${prefix}${mainKey}`;
        const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeyVal}')"`;
        await execAsync(psCommand);
      } catch {}
    }
  }

  private record(record: Omit<KeyboardActionRecord, "timestamp">) {
    this.actionHistory.push({
      ...record,
      timestamp: new Date().toISOString()
    });
  }
}
