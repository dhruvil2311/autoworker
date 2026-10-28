export interface HitlAuthResolution {
  username?: string;
  password?: string;
  otp?: string;
  resolution?: string;
}

type Resolver = (data: HitlAuthResolution) => void;

class HitlBus {
  private waiters = new Map<string, Resolver>();
  private pendingResolutions = new Map<string, HitlAuthResolution>();

  public registerWaiter(runId: string, resolver: Resolver) {
    const buffered = this.pendingResolutions.get(runId);
    if (buffered) {
      this.pendingResolutions.delete(runId);
      resolver(buffered);
      return;
    }
    this.waiters.set(runId, resolver);
  }

  public resolve(runId: string, data: HitlAuthResolution): boolean {
    const resolver = this.waiters.get(runId);
    if (resolver) {
      this.waiters.delete(runId);
      resolver(data);
      return true;
    }
    // Buffer resolution for when registerWaiter is called shortly
    this.pendingResolutions.set(runId, data);
    return false;
  }

  public removeWaiter(runId: string) {
    this.waiters.delete(runId);
    this.pendingResolutions.delete(runId);
  }

  public hasWaiter(runId: string): boolean {
    return this.waiters.has(runId);
  }
}

export const hitlBus = new HitlBus();
