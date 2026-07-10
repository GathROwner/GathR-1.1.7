#!/usr/bin/env node
/**
 * Expired-event leak probe for the live GathR backend.
 *
 * Pages GET {BASE}/api/v2/firestore/events?includeExpired=false (the exact
 * endpoint the app uses) and reports every served event whose effective end
 * time is already in the past (America/Halifax). A healthy backend returns
 * zero leaks.
 *
 * Usage:
 *   node scripts/check-expired-served.js
 *   GATHR_BACKEND_URL=https://... node scripts/check-expired-served.js
 */

const BASE_URL =
  process.env.GATHR_BACKEND_URL ||
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app';
const PAGE_LIMIT = 100;
const MAX_PAGES = 30;
const TIME_ZONE = 'America/Halifax';

function getNowSnapshot(timeZone = TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeTimeTo24h(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || '0');
    const meridiem = match[4].toUpperCase();
    if (hours < 1 || hours > 12 || minutes > 59 || seconds > 59) return null;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    else if (meridiem === 'PM' && hours < 12) hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || '0');
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  match = raw.match(/^(\d{1,2})\s*([AaPp])\.?\s*[Mm]\.?$/);
  if (match) {
    let hours = Number(match[1]);
    const meridiem = match[2].toUpperCase();
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'A' && hours === 12) hours = 0;
    else if (meridiem === 'P' && hours < 12) hours += 12;
    return `${String(hours).padStart(2, '0')}:00:00`;
  }

  return null;
}

function getDatePrefix(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Effective end key for an event, mirroring the serve-time rules:
 * missing endTime => end of day; endTime earlier than startTime => the
 * event crosses midnight and ends the day after endDate.
 */
function getEffectiveEndKey(event) {
  const startDate = getDatePrefix(event.startDate);
  const endDate = getDatePrefix(event.endDate) || startDate;
  if (!endDate) return null; // unparseable — reported separately

  const endTime = normalizeTimeTo24h(event.endTime);
  const startTime = normalizeTimeTo24h(event.startTime);
  if (endTime && startTime && endTime < startTime) {
    return `${addDays(endDate, 1)}T${endTime}`;
  }
  return `${endDate}T${endTime || '23:59:59'}`;
}

async function fetchPage(startAfter, isEvent) {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE_LIMIT));
  params.set('includeExpired', 'false');
  if (typeof isEvent === 'boolean') params.set('isEvent', String(isEvent));
  if (startAfter) params.set('startAfter', startAfter);

  const url = `${BASE_URL}/api/v2/firestore/events?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function scan(label, isEvent) {
  const nowKey = getNowSnapshot();
  const leaks = [];
  const unparseable = [];
  let total = 0;
  let startAfter = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchPage(startAfter, isEvent);
    const events = Array.isArray(data.events) ? data.events : [];
    total += events.length;

    for (const event of events) {
      const endKey = getEffectiveEndKey(event);
      if (!endKey) {
        unparseable.push(event);
      } else if (endKey < nowKey) {
        leaks.push({ event, endKey });
      }
    }

    if (!data.nextPageToken || events.length === 0) break;
    startAfter = data.nextPageToken;
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Halifax now: ${nowKey}`);
  console.log(`Served: ${total} | expired leaks: ${leaks.length} | unparseable dates: ${unparseable.length}`);

  for (const { event, endKey } of leaks) {
    console.log(
      `  LEAK  id=${event.id} "${event.title || event.name || '(untitled)'}" ` +
      `start=${event.startDate} ${event.startTime || ''} end=${event.endDate || ''} ${event.endTime || ''} ` +
      `=> effective end ${endKey}`
    );
  }
  for (const event of unparseable) {
    console.log(
      `  UNPARSEABLE  id=${event.id} "${event.title || '(untitled)'}" startDate=${event.startDate} endDate=${event.endDate}`
    );
  }

  return { total, leaks: leaks.length, unparseable: unparseable.length };
}

(async () => {
  console.log(`Probing ${BASE_URL} (includeExpired=false, the app's exact query)`);
  const events = await scan('events (isEvent=true)', true);
  const specials = await scan('specials (isEvent=false)', false);

  const totalLeaks = events.leaks + specials.leaks;
  console.log(`\nRESULT: ${totalLeaks === 0 ? 'CLEAN — no expired events served' : `${totalLeaks} expired event(s) still served`}`);
  process.exitCode = totalLeaks === 0 ? 0 : 1;
})().catch((error) => {
  console.error('Probe failed:', error);
  process.exitCode = 2;
});
