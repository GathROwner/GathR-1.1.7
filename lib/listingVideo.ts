import { renderFullscreenVideo, type FullscreenVideoOptions } from './listingVideoPlayer';
import type { Event } from '../types/events';
import { toFirestoreEventId } from '../utils/firestoreEventIds';

export type ListingVideo = { assetId: string; url: string; durationSeconds: number; bytes: number;
  expiresAt: string; sourcePostId: string };
const ENDPOINT = 'https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos';
export const listingVideoEnabled = process.env.EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED === 'true';
export function videoListingPath(event: Pick<Event, 'id' | 'venueId' | 'source' | 'locationScope'>): string | null {
  if (event.source !== 'firestore') return null;
  const id = toFirestoreEventId(event.id);
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) return null;
  if (event.locationScope && event.locationScope !== 'venue') return `events/${id}`;
  const venue = event.venueId;
  return venue && /^[A-Za-z0-9_.-]+$/.test(venue) ? `venues/${venue}/events/${id}` : null;
}
export function normalizeListingVideo(value: unknown, now = Date.now()): ListingVideo | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as ListingVideo;
  if (!/^[a-f0-9]{64}$/.test(v.assetId) ||
      v.url !== `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${v.assetId}.mp4` ||
      !Number.isFinite(v.durationSeconds) || v.durationSeconds <= 0 || v.durationSeconds > 60 ||
      !Number.isInteger(v.bytes) || v.bytes <= 0 || v.bytes > 8_000_000 ||
      !Number.isFinite(Date.parse(v.expiresAt)) || Date.parse(v.expiresAt) <= now || !/^\d+$/.test(v.sourcePostId)) return null;
  return v;
}
type Waiter = (value: ListingVideo | null) => void;
const cache = new Map<string, { value: ListingVideo | null; until: number }>();
const waiting = new Map<string, Waiter[]>();
const pending = new Map<string, Promise<ListingVideo | null>>();
let scheduled = false;
let inFlight = false;
async function flush(): Promise<void> {
  scheduled = false;
  if (inFlight) return;
  inFlight = true;
  const paths = [...waiting.keys()].slice(0, 50);
  const selected = new Map(paths.map(path => [path, waiting.get(path)!]));
  paths.forEach(path => waiting.delete(path));
  let videos: Record<string, unknown> = {};
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) });
    if (response.ok) videos = (await response.json()).videos || {};
  } catch { /* Existing images remain immediately available on any video failure. */ }
  finally { clearTimeout(timer); }
  for (const [path, handlers] of selected) {
    const value = normalizeListingVideo(videos[path]);
    cache.set(path, { value, until: Date.now() + 60_000 });
    handlers.forEach(done => done(value));
  }
  while (cache.size > 200) cache.delete(cache.keys().next().value!);
  inFlight = false;
  if (waiting.size && !scheduled) { scheduled = true; setTimeout(() => void flush(), 0); }
}
export function getListingVideo(path: string): Promise<ListingVideo | null> {
  if (!listingVideoEnabled) return Promise.resolve(null);
  const saved = cache.get(path);
  if (saved && saved.until > Date.now()) return Promise.resolve(normalizeListingVideo(saved.value));
  const current = pending.get(path); if (current) return current;
  const request = new Promise<ListingVideo | null>(done => {
    waiting.set(path, [...(waiting.get(path) || []), done]);
    if (!scheduled && !inFlight) { scheduled = true; setTimeout(() => void flush(), 0); }
  });
  pending.set(path, request);
  void request.finally(() => pending.delete(path));
  return request;
}
export function videoPlayerHtml(video: ListingVideo, startAt = 0, options: FullscreenVideoOptions = {}): string {
  if (!normalizeListingVideo(video)) throw new Error('Invalid listing video');
  return renderFullscreenVideo(video, startAt, options);
}

export function inlineVideoHtml(video: ListingVideo, startAt = 0): string {
  if (!normalizeListingVideo(video)) throw new Error('Invalid listing video');
  const start = Math.max(0, Math.min(60, Number.isFinite(startAt) ? startAt : 0));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src https://storage.googleapis.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}video{width:100%;height:100%;object-fit:cover}</style></head>
  <body><video playsinline autoplay muted preload="none" disablepictureinpicture src="${video.url}"></video>
  <script>const v=document.querySelector('video');const post=m=>window.ReactNativeWebView.postMessage(m);
  window.__listingVideoPause=()=>v.pause();window.__listingVideoPlay=()=>v.play().catch(()=>post('blocked'));window.__listingVideoMute=m=>{v.muted=m};
  v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(${start},Math.max(0,v.duration-0.1))});
  v.addEventListener('playing',()=>{if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(()=>post('playing'));else post('playing')});
  v.addEventListener('ended',()=>post('ended'));v.addEventListener('error',()=>post('error'));
  let last=0;v.addEventListener('timeupdate',()=>{if(Date.now()-last>500){last=Date.now();post(JSON.stringify({type:'progress',seconds:v.currentTime}))}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)v.pause()});</script></body></html>`;
}
