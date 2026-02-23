# Firestore Mode Configuration

## Overview

The GathR app can display events from two data sources:
- **Google Sheets**: Legacy event data from Google Sheets backend
- **Firestore**: New event data from Firestore database

You can configure which data sources appear on the map.

## Switching Between Modes

### Location
File: `store/mapStore.ts`

Look for the `fetchViewportEvents` function (around line 1076). Near the top of this function, you'll find:

```typescript
// DEBUG FLAG: Set to true to show ONLY Firestore events (hide Google Sheets)
const FIRESTORE_ONLY_MODE = true;
```

### Mode Options

**Show ONLY Firestore events:**
```typescript
const FIRESTORE_ONLY_MODE = true;
```
- Google Sheets events are hidden
- Only Firestore events appear on map
- Log message: `🔥 FIRESTORE_ONLY_MODE enabled - showing only Firestore events`

**Show BOTH data sources (default production mode):**
```typescript
const FIRESTORE_ONLY_MODE = false;
```
- Both Google Sheets and Firestore events appear
- Automatic deduplication (Google Sheets takes priority for duplicates)
- Firestore events marked with "F" indicator on map markers
- Log shows merge stats: `[MapLoad][viewport] Firestore merge: { fsTotal: 191, fsInViewport: 121, ... }`

## Visual Indicators

When `FIRESTORE_ONLY_MODE = false`:
- Markers with Firestore events show a small "F" badge
- This helps identify which clusters contain Firestore-sourced events
- Markers may contain events from both sources

When `FIRESTORE_ONLY_MODE = true`:
- All markers contain only Firestore events
- "F" indicator still appears but is redundant

## Technical Details

### How It Works
- **Parallel fetching**: Both APIs are called simultaneously using `Promise.allSettled`
- **Deduplication**: Events with matching title + date + venue are considered duplicates
- **Priority**: When duplicates exist, Google Sheets version is kept (when both sources enabled)
- **Graceful degradation**: If one API fails, the other continues to work

### API Endpoints
- **Google Sheets**: `https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events/viewport`
- **Firestore**: `https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events`

### Related Files
- `store/mapStore.ts` - Main configuration location
- `lib/api/firestoreEvents.ts` - Firestore API integration
- `lib/api/events.ts` - Unified events API (used by fetchEvents, not viewport)
- `types/firestore.ts` - Firestore data type definitions
- `app/(tabs)/map.tsx` - "F" indicator rendering in TreeMarker component

## After Making Changes

1. Change the `FIRESTORE_ONLY_MODE` flag value
2. Save the file
3. Rebuild the app:
   ```bash
   npm start
   # or
   npx expo start --clear
   ```
4. Check the console logs for confirmation message
