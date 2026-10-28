export class UploadWorker {
  private isUploading = false;
  private intervalId: number | null = null;
  
  start() {
    if (this.intervalId) return;
    this.intervalId = self.setInterval(() => this.processQueue(), 2000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async processQueue() {
    if (this.isUploading) return;
    this.isUploading = true;

    try {
      const config = await chrome.storage.local.get(["upload_queue", "api_url", "auth_token", "recording_state"]);
      let queue = config.upload_queue || [];
      
      if (queue.length === 0) {
        // If we were explicitly marked as uploading/finishing but have no chunks, check if we need to call finish
        if (config.recording_state === "uploading") {
          await this.finalizeUpload();
        }
        return;
      }
      
      if (!config.api_url || !config.auth_token) {
        throw new Error("Missing API configuration");
      }

      // Pop the first chunk
      const item = queue[0];
      
      const res = await fetch(`${config.api_url}/api/v1/recordings/${item.recordingId}/chunks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: config.auth_token.startsWith("Bearer") ? config.auth_token : `Bearer ${config.auth_token}`,
        },
        body: JSON.stringify(item.chunk)
      });

      if (!res.ok) {
        throw new Error(`Chunk upload failed: ${res.statusText}`);
      }

      // On success, pop from queue and update storage
      const newConfig = await chrome.storage.local.get(["upload_queue", "uploaded_chunks"]);
      const latestQueue = newConfig.upload_queue || [];
      // Remove the chunk we just uploaded
      const updatedQueue = latestQueue.filter((q: any) => q.id !== item.id);
      
      await chrome.storage.local.set({ 
        upload_queue: updatedQueue,
        uploaded_chunks: (newConfig.uploaded_chunks || 0) + 1,
        upload_error: null
      });

    } catch (err: any) {
      console.error("Upload worker error:", err);
      // We do not remove the chunk, so it will retry next tick
      await chrome.storage.local.set({ upload_error: err.message || "Network Error" });
    } finally {
      this.isUploading = false;
    }
  }

  private async finalizeUpload() {
    try {
      const config = await chrome.storage.local.get(["active_recording_id", "api_url", "auth_token"]);
      if (!config.active_recording_id) {
        await chrome.storage.local.set({ recording_state: "upload_success" });
        return;
      }
      
      const res = await fetch(`${config.api_url}/api/v1/recordings/${config.active_recording_id}/finish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: config.auth_token.startsWith("Bearer") ? config.auth_token : `Bearer ${config.auth_token}`,
        },
        body: JSON.stringify({ ended_at: new Date().toISOString() })
      });
      
      if (!res.ok) throw new Error(`Finish recording failed: ${res.statusText}`);
      
      await chrome.storage.local.set({ 
        recording_state: "upload_success",
        active_recording_id: null
      });
      
      this.notifyDashboard("recording_uploaded", config.active_recording_id);
    } catch (err: any) {
      console.error("Finalize error:", err);
      await chrome.storage.local.set({ recording_state: "upload_failed", upload_error: err.message });
      this.notifyDashboard("recording_upload_failed", null, err.message);
    }
  }

  private notifyDashboard(kind: string, recordingId?: string | null, error?: string) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.url && (tab.url.includes("localhost") || tab.url.includes("127.0.0.1"))) {
          chrome.tabs.sendMessage(tab.id, { kind, recording_id: recordingId, error }).catch(() => {});
        }
      });
    });
  }
}
