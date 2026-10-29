export type VideoSurface = 'events' | 'specials' | 'detail';
export type VideoCandidate = { assetId: string; surface: VideoSurface; visible: boolean;
  settledAt: number; distance: number; enabled: boolean; paused: boolean; onScreen?: boolean; manual?: boolean };

/** One lease across all listing surfaces; no media is created without it. */
export class ListingVideoAutoplay {
  private candidates = new Map<string, { value: VideoCandidate; notify: (active: boolean) => void }>();
  private scopes = new Map<VideoSurface, boolean>();
  private movement = new Map<VideoSurface, number>();
  private detailLayers = new Set<string>();
  private finished = new Set<string>();
  private positions = new Map<string, number>();
  private owner: string | null = null;
  private fullscreen: string | null = null;
  private foreground = true;
  readonly posterMs = 1000;

  update(id: string, value: VideoCandidate, notify: (active: boolean) => void, now = Date.now()) {
    this.candidates.set(id, { value, notify }); this.resetFinishedOutsideView(); this.evaluate(now);
  }
  remove(id: string) {
    const item = this.candidates.get(id); this.candidates.delete(id);
    if (this.owner === id) { this.owner = null; item?.notify(false); }
    if (this.fullscreen === id) this.fullscreen = null;
    this.resetFinishedOutsideView(); this.evaluate();
  }
  setScope(surface: VideoSurface, enabled: boolean) {
    this.scopes.set(surface, enabled); if (enabled) this.movement.set(surface, Date.now()); this.resetFinishedOutsideView(); this.evaluate();
  }
  motion(surface: VideoSurface, now = Date.now()) {
    this.movement.set(surface, now); this.evaluate(now);
  }
  detail(id: string, present: boolean) {
    if (present) this.detailLayers.add(id); else this.detailLayers.delete(id);
    this.evaluate();
  }
  setForeground(value: boolean) {
    if (value && !this.foreground) this.resetDwell();
    this.foreground = value; this.evaluate();
  }
  private resetDwell() { for (const surface of ['events', 'specials', 'detail'] as const) this.movement.set(surface, Date.now()); }
  setFullscreen(id: string, value: boolean) {
    if (value) this.fullscreen = id;
    else if (this.fullscreen === id) { this.fullscreen = null; this.resetDwell(); }
    this.evaluate();
  }
  private resetFinishedOutsideView() {
    for (const asset of this.finished) {
      const exposed = [...this.candidates.values()].some(({ value: c }) => c.assetId === asset &&
        (c.onScreen ?? c.visible) && (c.surface === 'detail' || this.scopes.get(c.surface) === true));
      if (!exposed) this.finished.delete(asset);
    }
  }
  complete(asset: string) {
    this.finished.add(asset); this.positions.delete(asset);
    if (this.finished.size > 200) this.finished.delete(this.finished.values().next().value!);
    this.evaluate();
  }
  replay(asset: string) { this.finished.delete(asset); this.positions.delete(asset); }
  position(asset: string) { return this.positions.get(asset) || 0; }
  remember(asset: string, seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60 || this.finished.has(asset)) return;
    this.positions.set(asset, seconds);
    if (this.positions.size > 200) this.positions.delete(this.positions.keys().next().value!);
  }
  hasFinished(asset: string) { return this.finished.has(asset); }
  evaluate(now = Date.now()) {
    const eligible = [...this.candidates].filter(([id, { value: c }]) =>
      this.foreground && !this.fullscreen && c.enabled && c.visible && !this.finished.has(c.assetId) &&
      (c.surface === 'detail' || (this.scopes.get(c.surface) === true && this.detailLayers.size === 0)) &&
      (c.manual || now - Math.max(c.settledAt, this.movement.get(c.surface) || 0) >= this.posterMs) &&
      (!c.paused || this.owner === id));
    eligible.sort((a, b) => Number(!!b[1].value.manual) - Number(!!a[1].value.manual) || Number(b[1].value.surface === 'detail') - Number(a[1].value.surface === 'detail') ||
      a[1].value.distance - b[1].value.distance);
    const next = eligible[0]?.[0] || null;
    if (next === this.owner) return;
    const previous = this.owner; this.owner = next;
    if (previous) this.candidates.get(previous)?.notify(false);
    if (next) this.candidates.get(next)?.notify(true);
  }
}
export const listingVideoAutoplay = new ListingVideoAutoplay();

export function videoVisibility(y: number, height: number, viewportTop: number, viewportBottom: number, x = 0, width = 1, viewportWidth = width, threshold = 0.75) {
  if (![y, height, viewportTop, viewportBottom, x, width, viewportWidth].every(Number.isFinite) || height <= 0 || width <= 0) return { visible: false, onScreen: false, distance: Infinity };
  const shown = Math.max(0, Math.min(y + height, viewportBottom) - Math.max(y, viewportTop));
  const across = Math.max(0, Math.min(x + width, viewportWidth) - Math.max(x, 0));
  return { visible: shown / height >= threshold && across / width >= threshold, onScreen: shown > 0 && across > 0,
    distance: Math.abs(y + height / 2 - (viewportTop + viewportBottom) / 2) };
}
