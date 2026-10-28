import { startRecorder, stopRecorder, pauseRecorder, resumeRecorder } from "./recorder.js";
import { mountHUD, unmountHUD } from "./hud.js";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.kind === "recording:start") {
    startRecorder();
    mountHUD();
  }
  if (message?.kind === "recording:stop") {
    stopRecorder();
    // HUD handles its own unmount on complete/upload
  }
  if (message?.kind === "recording:pause") pauseRecorder();
  if (message?.kind === "recording:resume") resumeRecorder();
  if (message?.kind === "recording_uploaded") {
    window.postMessage({
      type: "GHOST_RECORDING_COMPLETED",
      payload: { recordingId: message.recording_id }
    }, "*");
  }
  if (message?.kind === "recording_upload_failed") {
    window.postMessage({
      type: "GHOST_RECORDING_UPLOAD_FAILED",
      payload: { error: message.error }
    }, "*");
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "GHOST_EXTENSION_PING") {
    window.postMessage({ type: "GHOST_EXTENSION_CONNECTED" }, "*");
  }
  if (event.data?.type === "GHOST_EXTENSION_HANDSHAKE") {
    chrome.runtime.sendMessage({
      kind: "recording:handshake",
      payload: event.data.payload
    }, (response) => {
      if (response?.ok) {
        window.postMessage({ type: "GHOST_EXTENSION_CONNECTED" }, "*");
      }
    });
  }
  if (event.data?.type === "GHOST_START_RECORDING") {
    chrome.runtime.sendMessage({ 
      kind: "recording:start",
      payload: event.data.payload
    }, (response) => {
      if (response?.ok) {
        startRecorder();
        mountHUD();
      }
    });
  }
});

chrome.runtime.sendMessage({ kind: "recording:status" }, (response) => {
  if (response?.isRecording) {
    startRecorder();
    mountHUD();
  }
});
