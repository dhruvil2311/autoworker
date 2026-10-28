export class RecordingSession {
  public recordingId: string;
  public startedAt: string;
  public ghostName: string;
  
  private buffer: any[] = [];
  private readonly maxChunkSize = 50;

  constructor(recordingId: string, ghostName: string, startedAt?: string) {
    this.recordingId = recordingId;
    this.ghostName = ghostName;
    this.startedAt = startedAt ?? new Date().toISOString();
  }

  addEvent(event: any) {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxChunkSize) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length === 0) return;
    const chunk = {
      sequence: Date.now(),
      events: [...this.buffer]
    };
    this.buffer = [];
    
    // Add chunk to storage queue
    chrome.storage.local.get(["upload_queue", "total_chunks"], (result) => {
      const queue = result.upload_queue || [];
      queue.push({
        id: crypto.randomUUID(),
        recordingId: this.recordingId,
        chunk
      });
      chrome.storage.local.set({ 
        upload_queue: queue,
        total_chunks: (result.total_chunks || 0) + 1
      });
    });
  }
}
