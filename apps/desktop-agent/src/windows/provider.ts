import type { DesktopUIElement, DesktopUIElementBounds, DesktopTargetSelector } from "@ghost/workflow-schema";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface MonitorInfo {
  index: number;
  bounds: DesktopUIElementBounds;
  isPrimary: boolean;
}

export interface ApplicationProcessInfo {
  pid: number;
  name: string;
  title: string;
}

export interface WindowsUIProvider {
  getRunningApplications(): Promise<ApplicationProcessInfo[]>;
  launchApplication(appPathOrName: string, args?: string[] | undefined): Promise<{ pid: number; success: boolean }>;
  focusWindow(query: { title?: string | undefined; processName?: string | undefined; pid?: number | undefined }): Promise<boolean>;
  closeApplication(query: { processName?: string | undefined; pid?: number | undefined }): Promise<boolean>;
  inspectElements(query?: { windowTitle?: string | undefined; controlType?: string | undefined; name?: string | undefined; automationId?: string | undefined } | undefined): Promise<DesktopUIElement[]>;
  findElement(selector: DesktopTargetSelector): Promise<DesktopUIElement | null>;
  captureScreenshot(monitorIndex?: number | undefined): Promise<{ width: number; height: number; dataUrl: string }>;
  getMonitorConfiguration(): Promise<MonitorInfo[]>;
}

export class NativeWindowsUIProvider implements WindowsUIProvider {
  private isWindows = process.platform === "win32";

  async getRunningApplications(): Promise<ApplicationProcessInfo[]> {
    if (!this.isWindows) {
      return [];
    }
    try {
      const psCommand = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json"`;
      const { stdout } = await execAsync(psCommand);
      if (!stdout || stdout.trim() === "") return [];
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map(p => ({
        pid: p.Id,
        name: p.ProcessName,
        title: p.MainWindowTitle
      }));
    } catch {
      return [];
    }
  }

  async launchApplication(appPathOrName: string, args: string[] = []): Promise<{ pid: number; success: boolean }> {
    if (!this.isWindows) {
      return { pid: 9999, success: true };
    }
    try {
      const escapedArgs = args.length > 0 ? `-ArgumentList '${args.join("','")}'` : "";
      const psCommand = `powershell -NoProfile -Command "Start-Process -FilePath '${appPathOrName}' ${escapedArgs} -PassThru | Select-Object -ExpandProperty Id"`;
      const { stdout } = await execAsync(psCommand);
      const pid = parseInt(stdout.trim(), 10) || 0;
      return { pid, success: true };
    } catch {
      return { pid: 0, success: false };
    }
  }

  async focusWindow(query: { title?: string; processName?: string; pid?: number }): Promise<boolean> {
    if (!this.isWindows) {
      return true;
    }
    try {
      let filter = "";
      if (query.title) filter = `Where-Object { $_.MainWindowTitle -like '*${query.title}*' }`;
      else if (query.processName) filter = `Where-Object { $_.ProcessName -like '*${query.processName}*' }`;
      else if (query.pid) filter = `Where-Object { $_.Id -eq ${query.pid} }`;
      else return false;

      const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
"@
$proc = Get-Process | ${filter} | Select-Object -First 1
if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
  [Win32]::ShowWindow($proc.MainWindowHandle, 9)
  [Win32]::SetForegroundWindow($proc.MainWindowHandle)
  Write-Output "OK"
}
`;
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      return stdout.includes("OK");
    } catch {
      return false;
    }
  }

  async closeApplication(query: { processName?: string; pid?: number }): Promise<boolean> {
    if (!this.isWindows) {
      return true;
    }
    try {
      let target = "";
      if (query.pid) target = `-Id ${query.pid}`;
      else if (query.processName) target = `-Name '${query.processName}'`;
      else return false;

      await execAsync(`powershell -NoProfile -Command "Stop-Process ${target} -Force"`);
      return true;
    } catch {
      return false;
    }
  }

  async inspectElements(query?: { windowTitle?: string | undefined; controlType?: string | undefined; name?: string | undefined; automationId?: string | undefined } | undefined): Promise<DesktopUIElement[]> {
    if (!this.isWindows) {
      return [];
    }
    try {
      const psScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)

$results = @()
foreach ($win in $windows) {
  $name = $win.Current.Name
  $procId = $win.Current.ProcessId
  if ('${query?.windowTitle || ""}' -eq '' -or $name -like '*${query?.windowTitle || ""}*') {
    $bounds = $win.Current.BoundingRectangle
    $results += [PSCustomObject]@{
      application = "WindowsApp"
      processId = $procId
      windowTitle = $name
      controlType = "Window"
      name = $name
      automationId = $win.Current.AutomationId
      className = $win.Current.ClassName
      bounds = @{
        x = $bounds.X
        y = $bounds.Y
        width = $bounds.Width
        height = $bounds.Height
      }
      enabled = $win.Current.IsEnabled
      visible = -not $win.Current.IsOffscreen
    }
  }
}
$results | ConvertTo-Json -Depth 3
`;
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      if (!stdout || stdout.trim() === "") return [];
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map(item => ({
        application: item.application || "WindowsApp",
        processId: item.processId,
        windowTitle: item.windowTitle || "",
        controlType: item.controlType || "Window",
        name: item.name,
        automationId: item.automationId,
        className: item.className,
        bounds: item.bounds,
        enabled: item.enabled ?? true,
        visible: item.visible ?? true
      }));
    } catch {
      return [];
    }
  }

  async findElement(selector: DesktopTargetSelector): Promise<DesktopUIElement | null> {
    const elements = await this.inspectElements({
      windowTitle: selector.windowTitle,
      name: selector.name,
      automationId: selector.automationId,
      controlType: selector.controlType
    });

    if (elements.length > 0) {
      return elements[0]!;
    }

    if (selector.fallback) {
      return this.findElement(selector.fallback);
    }

    return null;
  }

  async captureScreenshot(_monitorIndex = 0): Promise<{ width: number; height: number; dataUrl: string }> {
    // Return standard 1920x1080 transparent/black canvas placeholder in base64
    const placeholderPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    return {
      width: 1920,
      height: 1080,
      dataUrl: placeholderPngBase64
    };
  }

  async getMonitorConfiguration(): Promise<MonitorInfo[]> {
    return [
      {
        index: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isPrimary: true
      }
    ];
  }
}

export class MockWindowsUIProvider implements WindowsUIProvider {
  public runningApps: ApplicationProcessInfo[] = [
    { pid: 1010, name: "EXCEL.EXE", title: "Sales_Orders.xlsx - Excel" },
    { pid: 2020, name: "TallyPrime.exe", title: "TallyPrime - Gateway of Tally" },
    { pid: 3030, name: "chrome.exe", title: "Shopify Admin - Google Chrome" }
  ];

  public mockElements: DesktopUIElement[] = [
    {
      application: "EXCEL.EXE",
      processId: 1010,
      windowTitle: "Sales_Orders.xlsx - Excel",
      controlType: "Edit",
      name: "Refund Amount",
      automationId: "Excel_Refund_Amount_Cell",
      className: "EXCEL7",
      bounds: { x: 120, y: 250, width: 100, height: 25 },
      enabled: true,
      visible: true,
      value: "450.00"
    },
    {
      application: "TallyPrime.exe",
      processId: 2020,
      windowTitle: "TallyPrime - Gateway of Tally",
      controlType: "Edit",
      name: "Search Customer",
      automationId: "Tally_Search_Customer_Input",
      className: "TallyEdit",
      bounds: { x: 300, y: 150, width: 200, height: 30 },
      enabled: true,
      visible: true,
      value: ""
    },
    {
      application: "TallyPrime.exe",
      processId: 2020,
      windowTitle: "TallyPrime - Gateway of Tally",
      controlType: "Edit",
      name: "Refund Amount",
      automationId: "Tally_Amount_Field",
      className: "TallyEdit",
      bounds: { x: 300, y: 220, width: 150, height: 30 },
      enabled: true,
      visible: true,
      value: ""
    },
    {
      application: "TallyPrime.exe",
      processId: 2020,
      windowTitle: "TallyPrime - Gateway of Tally",
      controlType: "Button",
      name: "Save",
      automationId: "Tally_Save_Btn",
      className: "TallyButton",
      bounds: { x: 450, y: 350, width: 80, height: 35 },
      enabled: true,
      visible: true
    },
    {
      application: "TallyPrime.exe",
      processId: 2020,
      windowTitle: "TallyPrime - Gateway of Tally",
      controlType: "Text",
      name: "Transaction Voucher Created",
      automationId: "Tally_Success_Msg",
      className: "TallyStatic",
      bounds: { x: 300, y: 400, width: 300, height: 25 },
      enabled: true,
      visible: true,
      value: "Saved"
    }
  ];

  public focusedWindow: string = "Sales_Orders.xlsx - Excel";
  public actionLogs: string[] = [];

  async getRunningApplications(): Promise<ApplicationProcessInfo[]> {
    return [...this.runningApps];
  }

  async launchApplication(appPathOrName: string): Promise<{ pid: number; success: boolean }> {
    const pid = 5000 + Math.floor(Math.random() * 1000);
    this.runningApps.push({ pid, name: appPathOrName, title: `${appPathOrName} Window` });
    this.actionLogs.push(`LAUNCH: ${appPathOrName} (PID ${pid})`);
    return { pid, success: true };
  }

  async focusWindow(query: { title?: string; processName?: string; pid?: number }): Promise<boolean> {
    const app = this.runningApps.find(a => 
      (query.title && a.title.toLowerCase().includes(query.title.toLowerCase())) ||
      (query.processName && a.name.toLowerCase().includes(query.processName.toLowerCase())) ||
      (query.pid && a.pid === query.pid)
    );
    if (app) {
      this.focusedWindow = app.title;
      this.actionLogs.push(`FOCUS: ${app.title}`);
      return true;
    }
    return false;
  }

  async closeApplication(query: { processName?: string; pid?: number }): Promise<boolean> {
    const idx = this.runningApps.findIndex(a => 
      (query.processName && a.name.toLowerCase().includes(query.processName.toLowerCase())) ||
      (query.pid && a.pid === query.pid)
    );
    if (idx >= 0) {
      const removed = this.runningApps.splice(idx, 1)[0]!;
      this.actionLogs.push(`CLOSE: ${removed.name}`);
      return true;
    }
    return false;
  }

  async inspectElements(query?: { windowTitle?: string | undefined; controlType?: string | undefined; name?: string | undefined; automationId?: string | undefined } | undefined): Promise<DesktopUIElement[]> {
    return this.mockElements.filter(el => {
      if (query?.windowTitle && !el.windowTitle.toLowerCase().includes(query.windowTitle.toLowerCase())) return false;
      if (query?.controlType && el.controlType !== query.controlType) return false;
      if (query?.name && el.name !== query.name) return false;
      if (query?.automationId && el.automationId !== query.automationId) return false;
      return true;
    });
  }

  async findElement(selector: DesktopTargetSelector): Promise<DesktopUIElement | null> {
    const match = this.mockElements.find(el => {
      if (selector.application && !el.application.toLowerCase().includes(selector.application.toLowerCase())) return false;
      if (selector.automationId && el.automationId !== selector.automationId) return false;
      if (selector.name && el.name?.toLowerCase() !== selector.name.toLowerCase()) return false;
      if (selector.visibleText && el.name && !el.name.toLowerCase().includes(selector.visibleText.toLowerCase())) return false;
      if (selector.semanticRole && el.controlType && !el.controlType.toLowerCase().includes(selector.semanticRole.toLowerCase())) return false;
      if (selector.controlType && el.controlType !== selector.controlType) return false;
      if (selector.text && (!el.value || !el.value.includes(selector.text)) && (!el.name || !el.name.includes(selector.text))) return false;
      return Boolean(selector.automationId || selector.name || selector.visibleText || selector.semanticRole || selector.controlType || selector.text || selector.application);
    });

    if (match) return match;

    if (selector.fallback) {
      return this.findElement(selector.fallback);
    }

    return null;
  }

  async captureScreenshot(_monitorIndex = 0): Promise<{ width: number; height: number; dataUrl: string }> {
    return {
      width: 1920,
      height: 1080,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    };
  }

  async getMonitorConfiguration(): Promise<MonitorInfo[]> {
    return [
      {
        index: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isPrimary: true
      },
      {
        index: 1,
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        isPrimary: false
      }
    ];
  }
}
