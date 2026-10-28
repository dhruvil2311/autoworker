const startBtn = document.querySelector("#btn-start");
const stopBtn = document.querySelector("#btn-stop");
const pauseResumeBtn = document.querySelector("#btn-pause-resume");
const retryBtn = document.querySelector("#btn-retry");
const cancelErrorBtn = document.querySelector("#btn-cancel-error");
const msgContainer = document.querySelector("#message-container");
const timerDisplay = document.querySelector("#timer-display");
const statusBadge = document.querySelector("#status-badge");
const statusText = document.querySelector("#status-text");
const errorDisplay = document.querySelector("#error-display");

const iconConnected = document.querySelector("#icon-connected");
const iconDisconnected = document.querySelector("#icon-disconnected");
const connectionTitle = document.querySelector("#connection-title");
const connectionSubtitle = document.querySelector("#connection-subtitle");

let state = "idle"; // idle, recording, paused, uploading, upload_failed
let timerInterval = null;
let secondsRecorded = 0;

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sc = (s % 60).toString().padStart(2, "0");
  return `${m}:${sc}`;
}

function updateUI() {
  document.body.className = `state-${state}`;
  
  if (state === "idle" || state === "upload_success") {
    document.body.className = "state-idle";
    statusBadge.className = "status-pill";
    statusText.textContent = "Ready to Learn";
    timerDisplay.textContent = "00:00";
    secondsRecorded = 0;
  } else if (state === "recording") {
    statusBadge.className = "status-pill recording";
    statusText.textContent = "Recording";
    document.querySelector("#icon-pause").style.display = "block";
    document.querySelector("#icon-resume").style.display = "none";
    document.querySelector("#text-pause-resume").textContent = "Pause Recording";
  } else if (state === "paused") {
    statusBadge.className = "status-pill paused";
    statusText.textContent = "Paused";
    document.querySelector("#icon-pause").style.display = "none";
    document.querySelector("#icon-resume").style.display = "block";
    document.querySelector("#text-pause-resume").textContent = "Resume Recording";
  } else if (state === "uploading") {
    statusBadge.className = "status-pill uploading";
    statusText.textContent = "Uploading...";
  } else if (state === "upload_failed") {
    statusBadge.className = "status-pill error";
    statusText.textContent = "Error";
  }
}

function showMessage(msg) {
  msgContainer.textContent = msg;
  setTimeout(() => { if(msgContainer.textContent === msg) msgContainer.textContent = ""; }, 5000);
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function loadConfig() {
  const result = await chrome.storage.local.get(["api_url", "auth_token", "recording_state", "recording_time", "upload_error"]);
  
  if (result.auth_token) {
    iconConnected.style.display = "block";
    iconDisconnected.style.display = "none";
    connectionTitle.textContent = "Connected to Ghost";
    connectionTitle.style.color = "#E8ECF4";
    connectionSubtitle.textContent = "Ready to record a demonstration.";
    startBtn.disabled = false;
  } else {
    iconConnected.style.display = "none";
    iconDisconnected.style.display = "block";
    connectionTitle.textContent = "Not Connected";
    connectionTitle.style.color = "#E8ECF4";
    connectionSubtitle.textContent = "Open the Ghost dashboard to connect this extension.";
    startBtn.disabled = true;
  }
  
  if (result.recording_state) {
    state = result.recording_state;
    secondsRecorded = result.recording_time || 0;
    if (state === "upload_failed" && result.upload_error) {
      errorDisplay.textContent = result.upload_error;
    }
    if (state === "recording") {
      startTimer();
    }
  }
  updateUI();
}

startBtn.addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  await chrome.runtime.sendMessage({ kind: "recording:start" });
  if (tabId) await chrome.tabs.sendMessage(tabId, { kind: "recording:start" }).catch(()=>{});
});

pauseResumeBtn.addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (state === "recording") {
    await chrome.runtime.sendMessage({ kind: "recording:pause" });
    if (tabId) await chrome.tabs.sendMessage(tabId, { kind: "recording:pause" }).catch(()=>{});
  } else {
    await chrome.runtime.sendMessage({ kind: "recording:resume" });
    if (tabId) await chrome.tabs.sendMessage(tabId, { kind: "recording:resume" }).catch(()=>{});
  }
});

stopBtn.addEventListener("click", async () => {
  const tabId = await getActiveTabId();
  if (tabId) await chrome.tabs.sendMessage(tabId, { kind: "recording:stop" }).catch(()=>{});
  chrome.runtime.sendMessage({ kind: "recording:stop" });
  // UI will update automatically via storage change event
});

retryBtn.addEventListener("click", async () => {
  chrome.runtime.sendMessage({ kind: "recording:retry_upload" });
});

cancelErrorBtn.addEventListener("click", async () => {
  if (confirm("Are you sure you want to discard this recording?")) {
    chrome.runtime.sendMessage({ kind: "recording:cancel" });
  }
});

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerDisplay.textContent = formatTime(secondsRecorded);
  timerInterval = setInterval(() => {
    if (state === "recording") {
      secondsRecorded++;
      timerDisplay.textContent = formatTime(secondsRecorded);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

loadConfig();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.recording_state) {
    const newState = changes.recording_state.newValue || "idle";
    if (newState !== state) {
      state = newState;
      if (state === "recording" && !timerInterval) {
        startTimer();
      } else if (state !== "recording") {
        stopTimer();
      }
      if (state === "upload_failed") {
        chrome.storage.local.get("upload_error").then(res => {
          errorDisplay.textContent = res.upload_error || "Network Error";
        });
      }
      updateUI();
    }
  }
  
  if (changes.uploaded_chunks || changes.total_chunks) {
    if (state === "uploading") {
      chrome.storage.local.get(["uploaded_chunks", "total_chunks"]).then(res => {
        const total = res.total_chunks || 0;
        const uploaded = res.uploaded_chunks || 0;
        if (total > 0) {
          const percentage = Math.round((uploaded / total) * 100);
          statusText.textContent = `Uploading chunk ${uploaded}/${total} (${percentage}%)`;
        }
      });
    }
  }
});
