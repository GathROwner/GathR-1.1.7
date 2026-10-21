export type OtaPhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'applying' | 'error';
export type OtaSnapshot = { phase: OtaPhase; readyId: string | null; downloadSequence: number };
type Adapter = {
  check: () => Promise<string | null>;
  fetch: () => Promise<string | null>;
  reload: () => Promise<void>;
  beforeReload: (id: string) => Promise<boolean>;
  safe: () => boolean;
  alreadyAttempted: (id: string) => boolean;
  cancelAttempt?: () => Promise<void>;
};
export const OTA_CHECK_INTERVAL = 30 * 60_000;
export const OTA_ABSENCE = 5 * 60_000;
export const OTA_DEADLINE = 90_000;

// A timeout ends visible status, but retains the single-flight lock until the
// native request settles. Retrying cannot start redundant native downloads.
export class OtaUpdateController {
  state: OtaSnapshot = { phase: 'idle', readyId: null, downloadSequence: 0 };
  private listeners = new Set<() => void>();
  private busy = false;
  private applying = false;
  private lastCheck = -Infinity;
  private checks = 0;
  private awayAt: number | null = null;
  private awayReady: string | null = null;
  private nativeTimer: ReturnType<typeof setTimeout> | undefined;
  private nativeBusy = false;
  constructor(private adapter: Adapter, private now = () => Date.now()) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private set(patch: Partial<OtaSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  ready(id: string | null) {
    if (this.nativeTimer) clearTimeout(this.nativeTimer);
    if (id && !this.applying) this.set({ readyId: id, phase: 'ready' });
  }
  nativeDownload(active: boolean) {
    this.nativeBusy = active;
    if (this.state.readyId || this.busy) return;
    if (active && !this.nativeTimer) {
      this.set({ phase: 'downloading', downloadSequence: this.state.downloadSequence + 1 });
      this.nativeTimer = setTimeout(() => { if (!this.state.readyId) this.set({ phase: 'error' }); }, OTA_DEADLINE);
    } else if (!active && this.nativeTimer) {
      clearTimeout(this.nativeTimer); this.nativeTimer = undefined;
      if (this.state.phase === 'downloading') this.set({ phase: 'idle' });
    }
  }
  async check() {
    if (this.busy || this.nativeBusy || this.state.readyId || this.checks >= 4 || this.now() - this.lastCheck < OTA_CHECK_INTERVAL) return;
    this.busy = true;
    this.checks++;
    this.lastCheck = this.now();
    this.set({ phase: 'checking' });
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      if (!this.state.readyId) this.set({ phase: 'error' });
    }, OTA_DEADLINE);
    try {
      const id = await this.adapter.check();
      if (expired || this.state.readyId) return;
      if (!id) { this.checks = 0; if (!this.state.readyId) this.set({ phase: 'idle' }); return; }
      this.set({ phase: 'downloading', downloadSequence: this.state.downloadSequence + 1 });
      const downloaded = await this.adapter.fetch();
      if (downloaded && !this.state.readyId) this.ready(downloaded);
      else if (!this.state.readyId) this.set({ phase: 'idle' });
    } catch { if (!this.state.readyId) this.set({ phase: 'error' }); }
    finally { clearTimeout(timeout); this.busy = false; }
  }
  background(safe = this.adapter.safe()) {
    // iOS inactive can mean Control Center, a permission prompt or a phone call.
    // The host only calls this for the actual background transition.
    if (this.awayAt === null) { this.awayAt = this.now(); this.awayReady = safe ? this.state.readyId : null; }
  }
  async foreground(allowApply = true) {
    const eligible = this.awayAt !== null && this.now() - this.awayAt >= OTA_ABSENCE
      && this.awayReady === this.state.readyId && Boolean(this.awayReady);
    this.awayAt = null; this.awayReady = null;
    if (eligible && allowApply) return this.apply();
    void this.check();
    return false;
  }
  async apply() {
    const id = this.state.readyId;
    if (!id || this.applying || !this.adapter.safe() || this.adapter.alreadyAttempted(id)) return false;
    this.applying = true;
    this.set({ phase: 'applying' });
    try {
      if (!await this.adapter.beforeReload(id) || !this.adapter.safe()) {
        await this.adapter.cancelAttempt?.();
        this.set({ phase: 'ready' }); return false;
      }
      // beforeReload durably records the attempt. A failed or rolled-back
      // launch cannot repeatedly reload the same update on future openings.
      await this.adapter.reload();
      this.set({ phase: 'ready' });
      return true;
    } catch { this.set({ phase: 'ready' }); return false; }
    finally { this.applying = false; }
  }
}
