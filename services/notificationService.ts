// services/notificationService.ts
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@gathr/notifications/v1';

type AnyEvent = {
  id: string | number;
  title?: string;
  venue?: string;
  address?: string;
  startDate?: string; // "YYYY-MM-DD"
  startTime?: string; // e.g. "12:00:00 AM" or "5:30 PM"
  endDate?: string;   // "YYYY-MM-DD"
  endTime?: string;   // e.g. "11:59:59 PM"
};

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

// Android channel (id must match trigger below)
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('gathr-reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

// --- local storage for scheduled IDs ---
async function getMap(): Promise<Record<string, { preId?: string; postId?: string }>> {
  try { return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}'); }
  catch { return {}; }
}
async function saveMap(map: Record<string, any>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// Cancel any scheduled notifications (regardless of stored IDs) that match eventId+kind.
// This protects against legacy schedules or missing map entries.
async function cancelByKind(eventId: string | number, kind: 'pre_event' | 'post_event_survey') {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const req of all) {
      const data: any = req?.content?.data || {};
      if (String(data?.eventId) === String(eventId) && data?.kind === kind) {
        try { await Notifications.cancelScheduledNotificationAsync(req.identifier); } catch {}
      }
    }
  } catch (e) {
    console.warn('[notifications] cancelByKind error', e);
  }
}

// Dismiss any already-delivered notifications for this event/kind (tray/center)
async function dismissDeliveredByKind(eventId: string | number, kind: 'pre_event' | 'post_event_survey') {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const data: any = n?.request?.content?.data || {};
      if (String(data?.eventId) === String(eventId) && data?.kind === kind) {
        try { await Notifications.dismissNotificationAsync(n.request.identifier); } catch {}
      }
    }
  } catch (e) {
    console.warn('[notifications] dismissDeliveredByKind error', e);
  }
}

// Robust time parsing ("12:00:00 AM", "11:59 PM", "18:30", etc.)
function parseTimeToHMS(raw?: string) {
  const input = (raw || '').trim();
  if (!input) return { h: 0, m: 0, sec: 0 };

  // Handle common keywords
  const kw = input.toLowerCase().trim();
  if (kw === 'noon') return { h: 12, m: 0, sec: 0 };
  if (kw === 'midnight') return { h: 0, m: 0, sec: 0 };

  // Normalize AM/PM variants: "p.m.", "p m", " pm", etc.
  // Remove dots and whitespace so "2:10 p.m." => "2:10pm"
  let norm = kw.replace(/\./g, '').replace(/\s+/g, '');

  // Extract and strip am/pm suffix if present
  let ampm: 'AM' | 'PM' | null = null;
  if (norm.endsWith('am')) { ampm = 'AM'; norm = norm.slice(0, -2); }
  else if (norm.endsWith('pm')) { ampm = 'PM'; norm = norm.slice(0, -2); }

  const [hhRaw = '0', mmRaw = '0', ssRaw = '0'] = norm.split(':');
  let h = parseInt(hhRaw, 10) || 0;
  const m = parseInt(mmRaw, 10) || 0;
  const sec = parseInt(ssRaw, 10) || 0;

  // Clamp
  h = Math.max(0, Math.min(23, h));
  const mm = Math.max(0, Math.min(59, m));
  const ss = Math.max(0, Math.min(59, sec));

  // Apply AM/PM
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  return { h, m: mm, sec: ss };
}

function buildStartDate(event: AnyEvent): Date | null {
  try {
    const [y, mo, d] = (event.startDate || '').split('-').map(n => parseInt(n, 10));
    if (!y || !mo || !d) return null;
    const { h, m, sec } = parseTimeToHMS(event.startTime);
    return new Date(y, mo - 1, d, h, m, sec || 0); // device local TZ
  } catch {
    return null;
  }
}

function buildEndDate(event: AnyEvent): Date | null {
  try {
    const [y, mo, d] = (event.endDate || event.startDate || '').split('-').map(n => parseInt(n, 10));
    if (!y || !mo || !d) return null;
    const { h, m, sec } = parseTimeToHMS(event.endTime || '11:59 PM');
    return new Date(y, mo - 1, d, h, m, sec || 0);
  } catch {
    return null;
  }
}


/**
 * Schedule a 30-min-before notification for this event.
 * Returns the scheduled notification id or null if skipped.
 */
export async function schedulePreEventNotification(event: AnyEvent): Promise<string | null> {
  // Compute the event's start date in the device's local timezone
  const start = buildStartDate(event);
  if (!start) return null;

  const now = new Date();
  const endForLog = buildEndDate(event);

  // Base trigger is 30 minutes before the start
  let triggerAt = new Date(start.getTime() - 30 * 60 * 1000);

  // If the event has already begun, don't schedule a pre-event notification
  if (start.getTime() <= now.getTime()) {
    console.log('[notifications] pre-event: skipped (event already started)', { eventId: String(event.id), start: start.toString(), now: now.toString() });
    return null;
  }

  // If the 30‑minute warning has already passed, schedule the notification as soon as possible.
  // We pick a short delay (e.g., 10s) to avoid scheduling a notification in the immediate past,
  // which on some platforms would cause the notification to fire instantly.
  if (triggerAt.getTime() <= now.getTime()) {
    triggerAt = new Date(now.getTime() + 10 * 1000);
  }

  console.log('[notifications] pre-event', {
    eventId: String(event.id),
    start: start.toString(),
    end: endForLog ? endForLog.toString() : '(null)',
    triggerAt: triggerAt.toString(),
    now: now.toString(),
  });

  // Ensure no stale scheduled or delivered items (idempotent)
  await cancelByKind(event.id, 'pre_event');
  await dismissDeliveredByKind(event.id, 'pre_event');

await ensureAndroidChannel();

  // Schedule the notification
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ Starts soon: ${event.title || 'Event'}`,
      body: event.venue ? `${event.venue}${event.address ? ` – ${event.address}` : ''}` : "Don't miss it!",
      data: { 
        kind: 'pre_event', 
        eventId: String(event.id),
        scheduledFor: triggerAt.getTime()
      },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(31, Math.ceil((triggerAt.getTime() - Date.now()) / 1000)),
      repeats: false
    },
  });

  // Persist the scheduled ID so we can cancel it later
  const map = await getMap();
  const key = String(event.id);
  map[key] = { ...(map[key] || {}), preId: id };
  await saveMap(map);
  return id;
}

export async function cancelPreEventNotification(eventId: string | number) {
  console.log('[notifications] cancel pre_event', { eventId: String(eventId) });
  const key = String(eventId);
  const map = await getMap();
  const preId = map[key]?.preId;
  if (preId) {
    try { 
      await Notifications.cancelScheduledNotificationAsync(preId);
      console.log('[notifications] cancelled stored pre_event notification', { eventId: String(eventId), notificationId: preId });
    } catch (e) {
      console.warn('[notifications] failed to cancel stored pre_event notification', e);
    }
    delete map[key].preId;
    await saveMap(map);
  }
  await cancelByKind(eventId, 'pre_event');
  await dismissDeliveredByKind(eventId, 'pre_event');
  console.log('[notifications] pre_event cancellation complete', { eventId: String(eventId) });
}

/** LEGACY SWEEP: cancel any post-event surveys for this event even if older builds
 * didn't put { kind, eventId } into content.data.
 */
async function legacySweepPostEvent(event: AnyEvent) {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const req of all) {
      const c: any = req?.content || {};
      const title = (c.title ?? '').toString().toLowerCase();
      const body  = (c.body  ?? '').toString().toLowerCase();
      const data: any = c.data || {};

      const sameEvent   = String(data?.eventId) === String(event.id);
      const isPostKind  = data?.kind === 'post_event_survey';
      const looksLikeHW =
        title.includes('how was it') &&
        (
          (event.title && body.includes(String(event.title).toLowerCase())) ||
          (event.venue && body.includes(String(event.venue).toLowerCase()))
        );

      // Cancel if explicitly same event, or if it "looks like" ours but lacks proper data
      if (sameEvent || (looksLikeHW && !isPostKind)) {
        try { await Notifications.cancelScheduledNotificationAsync(req.identifier); } catch {}
      }
    }
  } catch (e) {
    console.warn('[notifications] legacySweepPostEvent error', e);
  }
}

/**
 * Schedule a 15-min-after-end survey prompt.
 * Returns the scheduled notification id or null if skipped.
 */
export async function schedulePostEventSurveyNotification(event: AnyEvent): Promise<string | null> {
  console.log('[notifications] post-event entry', {
    eventId: String(event.id),
    endDate: event.endDate,
    endTime: event.endTime,
  });

  // Compute the event's end date in the device's local timezone
  const end = buildEndDate(event);
  if (!end) return null;

  const now = new Date();

  // If the event has already ended, there is no point in scheduling a post‑event survey.
  if (end.getTime() <= now.getTime()) {
    console.log('[notifications] post-event: skipped (event already ended)', { eventId: String(event.id), end: end.toString(), now: now.toString() });
    return null;
  }


// TESTING: Fire 30 seconds after event ends
 let triggerAt = new Date(end.getTime() + 30 * 1000);

  // Base trigger is 15 minutes after the event ends
 // let triggerAt = new Date(end.getTime() + 15 * 60 * 1000);

  // If the trigger time is in the past or very close to now (within 30 seconds),
  // move it forward so that the notification doesn't fire immediately or get skipped.
  if (triggerAt.getTime() <= now.getTime() + 30000) {
    triggerAt = new Date(now.getTime() + 30 * 1000);
  }

  // One-time sweep for any legacy schedules that lack { kind, eventId }
  await legacySweepPostEvent(event);

  // Ensure we don't have leftovers for this event/kind (idempotent)
  await cancelByKind(event.id, 'post_event_survey');
  await dismissDeliveredByKind(event.id, 'post_event_survey');

  // Log the computed times we will actually schedule
  console.log('[notifications] post-event schedule', {
    eventId: String(event.id),
    end: end.toString(),
    triggerAt: triggerAt.toString(),
    now: now.toString(),
  });

  // Schedule the notification
await debugLogScheduledNotifications();
  await ensureAndroidChannel();

  // Schedule the notification
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${event.title || 'Event'} just ended - did you attend? (Tap to answer)`,
      body: event.venue ? `at ${event.venue}` : 'Tap to let us know',
      categoryIdentifier: 'post_event_attendance',
      data: { 
        kind: 'post_event_survey', 
        eventId: String(event.id),
        scheduledFor: triggerAt.getTime(),
        eventTitle: event.title || 'Event',
        eventVenue: event.venue || ''
      },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(31, Math.ceil((triggerAt.getTime() - Date.now()) / 1000)),
      repeats: false
    },
  });

  await debugLogScheduledNotifications();

  // Persist the scheduled ID so we can cancel it later
  const map = await getMap();
  const key = String(event.id);
  map[key] = { ...(map[key] || {}), postId: id };
  await saveMap(map);
  return id;
}

export async function cancelPostEventNotification(eventId: string | number) {
  console.log('[notifications] cancel post_event_survey', { eventId: String(eventId) });
  const key = String(eventId);
  const map = await getMap();
  const postId = map[key]?.postId;
  if (postId) {
    try { 
      await Notifications.cancelScheduledNotificationAsync(postId);
      console.log('[notifications] cancelled stored post_event_survey notification', { eventId: String(eventId), notificationId: postId });
    } catch (e) {
      console.warn('[notifications] failed to cancel stored post_event_survey notification', e);
    }
    delete map[key].postId;
    await saveMap(map);
  }
  await cancelByKind(eventId, 'post_event_survey');
  await dismissDeliveredByKind(eventId, 'post_event_survey');
  console.log('[notifications] post_event_survey cancellation complete', { eventId: String(eventId) });
}

export async function debugCancelAllScheduledNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[notifications] cancelAllScheduledNotificationsAsync: done');
  } catch (e) {
    console.warn('[notifications] cancelAllScheduledNotificationsAsync error', e);
  }
}

export function installNotificationDebugListeners() {
  try {
Notifications.addNotificationReceivedListener(async (n) => {
  const id = (n as any)?.request?.identifier;
  const data: any = n?.request?.content?.data || {};
  const kind = data?.kind;
  const scheduledFor = Number(data?.scheduledFor || 0);
  const now = Date.now();

  // If the OS delivers a notification *before* its intended time, dismiss it.
  if (scheduledFor && now + 1000 < scheduledFor) {
    console.log('[notifications] EARLY_DELIVERY — dismissing', {
      id,
      kind,
      scheduledFor: new Date(scheduledFor).toString(),
      now: new Date(now).toString(),
      data,
    });
    try { await Notifications.dismissNotificationAsync(id); } catch {}
    return;
  }

  console.log('[notifications] RECEIVED', {
    id,
    title: n?.request?.content?.title,
    body: n?.request?.content?.body,
    data,
  });
});

    Notifications.addNotificationResponseReceivedListener((resp) => {
      const n = resp?.notification;
      console.log('[notifications] RESPONSE', {
        id: (n as any)?.request?.identifier,
        title: n?.request?.content?.title,
        body: n?.request?.content?.body,
        data: n?.request?.content?.data,
        actionId: resp?.actionIdentifier,
      });
    });
  } catch (e) {
    console.warn('[notifications] installNotificationDebugListeners error', e);
  }
}

export async function debugLogScheduledNotifications() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[notifications] scheduled count =', all.length);
    for (const req of all) {
      console.log('[notifications] scheduled', {
        id: req.identifier,
        title: req?.content?.title,
        data:  req?.content?.data,
        trigger: (req as any)?.trigger,
      });
    }
  } catch (e) {
    console.warn('[notifications] debugLogScheduledNotifications error', e);
  }
}

