import { RecordingSession } from "./recording-session.js";
import { UploadWorker } from "./upload-worker.js";

let activeSession: RecordingSession | null = null;
const worker = new UploadWorker();
worker.start();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.kind === "recording:handshake") {
      await chrome.storage.local.set({
        api_url: message.payload.apiUrl,
        auth_token: message.payload.token,
        ghostWorkerId: message.payload.workerId
      });
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:status") {
      const config = await chrome.storage.local.get("recording_state");
      sendResponse({ ok: true, isRecording: activeSession !== null && config.recording_state === "recording" });
      return;
    }

    if (message?.kind === "recording:poll") {
      const config = await chrome.storage.local.get([
        "recording_state", "recording_time", "last_tick", "ghost_name", 
        "upload_error", "total_chunks", "uploaded_chunks"
      ]);
      const state = config.recording_state || "idle";
      
      let elapsed = config.recording_time || 0;
      if (state === "recording" && config.last_tick) {
        elapsed += Math.floor((Date.now() - config.last_tick) / 1000);
      }
      
      sendResponse({
        isRecording: (state === "recording" || state === "paused" || state === "uploading" || state === "upload_failed"),
        state,
        time: elapsed,
        ghostName: config.ghost_name,
        error: config.upload_error,
        totalChunks: config.total_chunks || 0,
        uploadedChunks: config.uploaded_chunks || 0
      });
      return;
    }

    if (message?.kind === "recording:start") {
      const payload = message.payload || {};
      const config = await chrome.storage.local.get(["api_url", "auth_token"]);
      
      try {
        const res = await fetch(`${config.api_url}/api/v1/recordings/start`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: config.auth_token.startsWith("Bearer") ? config.auth_token : `Bearer ${config.auth_token}`,
          },
          body: JSON.stringify({ source: "chrome_extension", metadata: { extension_version: chrome.runtime.getManifest().version } })
        });
        if (!res.ok) throw new Error("Failed to start recording on API");
        const data = await res.json();
        
        activeSession = new RecordingSession(data.recording_id, payload.workerName || "Unknown Ghost");
        
        await chrome.storage.local.set({ 
          recording_state: "recording", 
          recording_time: 0,
          last_tick: Date.now(),
          ghost_name: payload.workerName || "Unknown Ghost",
          active_recording_id: data.recording_id,
          upload_queue: [],
          total_chunks: 0,
          uploaded_chunks: 0,
          upload_error: null
        });
        sendResponse({ ok: true, recording_id: data.recording_id });
      } catch (err: any) {
        await chrome.storage.local.set({ recording_state: "upload_failed", upload_error: err.message });
        sendResponse({ ok: false, error: err.message });
      }
      return;
    }
    
    if (message?.kind === "recording:pause") {
      const config = await chrome.storage.local.get(["recording_state", "recording_time", "last_tick"]);
      if (config.recording_state === "recording") {
        let elapsed = config.recording_time || 0;
        if (config.last_tick) elapsed += Math.floor((Date.now() - config.last_tick) / 1000);
        await chrome.storage.local.set({ recording_state: "paused", recording_time: elapsed, last_tick: null });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:resume") {
      const config = await chrome.storage.local.get(["recording_state"]);
      if (config.recording_state === "paused") {
        await chrome.storage.local.set({ recording_state: "recording", last_tick: Date.now() });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:cancel") {
      activeSession = null;
      await chrome.storage.local.set({ recording_state: "idle", upload_error: null, upload_queue: [], active_recording_id: null });
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:event") {
      const config = await chrome.storage.local.get(["recording_state"]);
      if (config.recording_state !== "recording") {
        sendResponse({ ok: false, reason: "not_recording" });
        return;
      }
      if (activeSession) {
        activeSession.addEvent(message.event);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:stop") {
      if (activeSession) {
        activeSession.flush();
        activeSession = null;
      }
      await chrome.storage.local.set({ recording_state: "uploading", last_tick: null });
      sendResponse({ ok: true });
      return;
    }

    if (message?.kind === "recording:retry_upload") {
      await chrome.storage.local.set({ recording_state: "uploading", upload_error: null });
      sendResponse({ ok: true });
      return;
    }

  })();
  return true;
});
