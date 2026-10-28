export class GhostHUD {
  private container: HTMLDivElement;
  private shadow: ShadowRoot;
  private timerEl: HTMLSpanElement;
  private statusDotEl: HTMLSpanElement;
  private statusTextEl: HTMLSpanElement;
  private ghostNameEl: HTMLDivElement;
  private eventsEl: HTMLDivElement;
  private domainEl: HTMLDivElement;
  
  private pauseBtn: HTMLButtonElement;
  private finishBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private collapseBtn: HTMLButtonElement;
  private retryBtn: HTMLButtonElement;

  private pollInterval: number | null = null;
  private isCollapsed = false;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "ghost-recording-hud";
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      pointer-events: none;
    `;
    this.container.style.pointerEvents = "auto";
    
    this.shadow = this.container.attachShadow({ mode: "closed" });
    this.shadow.innerHTML = this.getStyles() + this.getHTML();
    
    document.documentElement.appendChild(this.container);

    this.timerEl = this.shadow.querySelector(".gh-timer")!;
    this.statusDotEl = this.shadow.querySelector(".gh-status-dot")!;
    this.statusTextEl = this.shadow.querySelector(".gh-status-text")!;
    this.ghostNameEl = this.shadow.querySelector(".gh-ghost-name")!;
    this.eventsEl = this.shadow.querySelector(".gh-events")!;
    this.domainEl = this.shadow.querySelector(".gh-domain")!;
    
    this.pauseBtn = this.shadow.querySelector("#gh-btn-pause")!;
    this.finishBtn = this.shadow.querySelector("#gh-btn-finish")!;
    this.cancelBtn = this.shadow.querySelector("#gh-btn-cancel")!;
    this.collapseBtn = this.shadow.querySelector("#gh-btn-collapse")!;
    this.retryBtn = this.shadow.querySelector("#gh-btn-retry")!;

    this.attachListeners();
    this.startPolling();
  }

  private getStyles() {
    return `
      <style>
        .gh-hud {
          background: rgba(17, 24, 39, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #f3f4f6;
          width: 340px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        .gh-hud.collapsed {
          width: auto;
          min-width: 140px;
          border-radius: 24px;
        }
        .gh-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          cursor: grab;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          user-select: none;
        }
        .gh-header:active {
          cursor: grabbing;
        }
        .gh-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .gh-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444; /* red for recording */
          box-shadow: 0 0 8px #ef4444;
          animation: pulse 2s infinite;
        }
        .gh-status-dot.paused {
          background: #f59e0b; /* yellow */
          box-shadow: 0 0 8px #f59e0b;
          animation: none;
        }
        .gh-status-dot.uploading {
          background: #3b82f6; /* blue */
          box-shadow: 0 0 8px #3b82f6;
          animation: pulse 1s infinite;
        }
        .gh-status-dot.error {
          background: #ef4444; /* red */
          box-shadow: 0 0 8px #ef4444;
          animation: none;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .gh-status-text {
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
        }
        .gh-timer {
          font-family: monospace;
          font-size: 16px;
          color: #9ca3af;
        }
        .gh-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .gh-hud.collapsed .gh-body {
          display: none;
        }
        .gh-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
        .gh-label {
          color: #9ca3af;
        }
        .gh-value {
          font-weight: 500;
          color: #e5e7eb;
          text-align: right;
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gh-controls {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .gh-hud.collapsed .gh-controls {
          display: none;
        }
        .gh-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 6px;
          padding: 8px 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        .gh-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .gh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .gh-btn-primary {
          background: #10b981;
          border-color: #10b981;
        }
        .gh-btn-primary:hover:not(:disabled) {
          background: #059669;
        }
        .gh-btn-danger {
          background: transparent;
          border: 1px solid transparent;
          color: #ef4444;
        }
        .gh-btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.1);
        }
        .gh-btn-icon {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gh-btn-icon:hover {
          color: #fff;
        }
        .gh-progress {
          display: none;
          padding: 24px;
          text-align: center;
          color: #e5e7eb;
          font-size: 14px;
          word-break: break-word;
        }
        .gh-hud.uploading .gh-body { display: none; }
        .gh-hud.uploading .gh-controls { display: none; }
        .gh-hud.uploading .gh-progress { display: block; }
        
        .gh-hud.error .gh-body { display: none; }
        .gh-hud.error .gh-progress { display: block; color: #fca5a5; }
        
        .gh-controls-default { display: flex; gap: 8px; width: 100%; }
        .gh-controls-error { display: none; gap: 8px; width: 100%; }
        
        .gh-hud.error .gh-controls-default { display: none; }
        .gh-hud.error .gh-controls-error { display: flex; }
      </style>
    `;
  }

  private getHTML() {
    return `
      <div class="gh-hud">
        <div class="gh-header">
          <div class="gh-header-left">
            <span class="gh-status-dot"></span>
            <span class="gh-status-text">Recording</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="gh-timer">00:00</span>
            <button class="gh-btn-icon" id="gh-btn-collapse" title="Collapse/Expand">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          </div>
        </div>
        
        <div class="gh-body">
          <div class="gh-row">
            <span class="gh-label">Ghost</span>
            <span class="gh-value gh-ghost-name">Unknown</span>
          </div>
          <div class="gh-row">
            <span class="gh-label">Domain</span>
            <span class="gh-value gh-domain">${window.location.hostname}</span>
          </div>
          <div class="gh-row">
            <span class="gh-label">Events captured</span>
            <span class="gh-value gh-events">0</span>
          </div>
        </div>

        <div class="gh-progress" id="gh-progress-text">
          Uploading recording...
        </div>

        <div class="gh-controls">
          <div class="gh-controls-default">
            <button class="gh-btn gh-btn-danger" id="gh-btn-cancel">Cancel</button>
            <button class="gh-btn" id="gh-btn-pause">Pause</button>
            <button class="gh-btn gh-btn-primary" id="gh-btn-finish">Finish Recording</button>
          </div>
          <div class="gh-controls-error">
            <button class="gh-btn gh-btn-danger" id="gh-btn-cancel-error">Cancel</button>
            <button class="gh-btn gh-btn-primary" id="gh-btn-retry">Retry Upload</button>
          </div>
        </div>
      </div>
    `;
  }

  private attachListeners() {
    this.collapseBtn.addEventListener("click", () => {
      this.isCollapsed = !this.isCollapsed;
      const hud = this.shadow.querySelector(".gh-hud")!;
      if (this.isCollapsed) {
        hud.classList.add("collapsed");
        this.collapseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      } else {
        hud.classList.remove("collapsed");
        this.collapseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
      }
    });

    this.pauseBtn.addEventListener("click", () => {
      if (this.pauseBtn.textContent === "Pause") {
        chrome.runtime.sendMessage({ kind: "recording:pause" });
      } else {
        chrome.runtime.sendMessage({ kind: "recording:resume" });
      }
    });

    const handleCancel = () => {
      if (confirm("Are you sure you want to cancel this recording?")) {
        chrome.runtime.sendMessage({ kind: "recording:cancel" });
        this.destroy();
      }
    };

    this.cancelBtn.addEventListener("click", handleCancel);
    this.shadow.querySelector("#gh-btn-cancel-error")!.addEventListener("click", handleCancel);

    this.finishBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ kind: "recording:stop" });
      // Optimistic update
      const hud = this.shadow.querySelector(".gh-hud")!;
      hud.className = "gh-hud uploading";
      this.statusTextEl.textContent = "Uploading...";
      this.statusDotEl.className = "gh-status-dot uploading";
      this.shadow.querySelector("#gh-progress-text")!.textContent = "Uploading recording...";
    });

    this.retryBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ kind: "recording:retry_upload" });
      // Optimistic update
      const hud = this.shadow.querySelector(".gh-hud")!;
      hud.className = "gh-hud uploading";
      this.statusTextEl.textContent = "Uploading...";
      this.statusDotEl.className = "gh-status-dot uploading";
      this.shadow.querySelector("#gh-progress-text")!.textContent = "Retrying upload...";
    });

    // Drag logic
    const header = this.shadow.querySelector(".gh-header") as HTMLElement;
    header.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      const rect = this.container.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });
    
    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      let left = e.clientX - this.dragOffset.x;
      let top = e.clientY - this.dragOffset.y;
      
      // Keep in viewport
      const width = this.container.offsetWidth;
      const height = this.container.offsetHeight;
      left = Math.max(0, Math.min(left, window.innerWidth - width));
      top = Math.max(0, Math.min(top, window.innerHeight - height));
      
      this.container.style.left = left + "px";
      this.container.style.top = top + "px";
      this.container.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
    });
  }

  private startPolling() {
    this.pollInterval = window.setInterval(async () => {
      try {
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ kind: "recording:poll" }, resolve);
        });
        
        if (!response || !response.isRecording) {
          // If we reach here and we were not explicitly informed of a state, just destroy.
          if (response?.state === "upload_success" || response?.state === "idle" || !response?.state) {
            this.destroy();
          }
          return;
        }

        this.updateUI(response);
        // Forward state to dashboard if we are on the dashboard
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          window.postMessage({ type: "GHOST_RECORDING_STATE", payload: response }, "*");
        }
      } catch (e) {
        // Extension context might have reloaded
      }
    }, 1000);
  }

  private updateUI(state: any) {
    const mins = Math.floor(state.time / 60).toString().padStart(2, "0");
    const secs = (state.time % 60).toString().padStart(2, "0");
    this.timerEl.textContent = `${mins}:${secs}`;
    this.eventsEl.textContent = state.eventsCount.toString();
    this.ghostNameEl.textContent = state.ghostName || "Unknown Ghost";

    const hud = this.shadow.querySelector(".gh-hud")!;

    if (state.state === "paused") {
      hud.className = this.isCollapsed ? "gh-hud collapsed" : "gh-hud";
      this.statusTextEl.textContent = "Paused";
      this.statusDotEl.className = "gh-status-dot paused";
      this.pauseBtn.textContent = "Resume";
      this.pauseBtn.className = "gh-btn gh-btn-primary";
    } else if (state.state === "recording") {
      hud.className = this.isCollapsed ? "gh-hud collapsed" : "gh-hud";
      this.statusTextEl.textContent = "Recording";
      this.statusDotEl.className = "gh-status-dot";
      this.pauseBtn.textContent = "Pause";
      this.pauseBtn.className = "gh-btn";
    } else if (state.state === "uploading") {
      hud.className = this.isCollapsed ? "gh-hud collapsed uploading" : "gh-hud uploading";
      this.statusTextEl.textContent = "Uploading...";
      this.statusDotEl.className = "gh-status-dot uploading";
      this.shadow.querySelector("#gh-progress-text")!.textContent = "Uploading recording...";
    } else if (state.state === "upload_failed") {
      hud.className = this.isCollapsed ? "gh-hud collapsed error" : "gh-hud error";
      this.statusTextEl.textContent = "Upload Failed";
      this.statusDotEl.className = "gh-status-dot error";
      this.shadow.querySelector("#gh-progress-text")!.textContent = `Error: ${state.error || 'Unknown network error'}`;
    }
    
    if (state.state === "uploading" && state.totalChunks > 0) {
      const percentage = Math.round((state.uploadedChunks / state.totalChunks) * 100);
      const progressText = `Uploading chunk ${state.uploadedChunks} of ${state.totalChunks} (${percentage}%)`;
      this.shadow.querySelector("#gh-progress-text")!.textContent = progressText;
      
      // Update Dashboard if we are on the dashboard
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        window.postMessage({ type: "GHOST_RECORDING_PROGRESS", payload: { percentage, ...state } }, "*");
      }
    }
  }

  public destroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    currentHud = null;
  }
}

// Global instance management
let currentHud: GhostHUD | null = null;

export function mountHUD() {
  // Force purge any existing zombie DOM elements
  const existing = document.getElementById("ghost-recording-hud");
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  
  if (currentHud) {
    currentHud.destroy();
  }
  currentHud = new GhostHUD();
}

export function unmountHUD() {
  if (currentHud) {
    currentHud.destroy();
  }
}
