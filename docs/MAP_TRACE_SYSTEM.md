# Map Trace System

## Purpose

This document explains the release-safe map tracing system that was built for the iOS production/preview-only map callout bug.

It exists because:
- the bug does not reproduce in normal development builds
- release timing matters
- normal console logging is not enough
- logs needed to be exported from a real iPhone back into chat

## Current Status

The trace system is currently enabled again.

Important history:
- it was temporarily disabled during cleanup
- after that cleanup, the bug appeared to regress
- the system was re-enabled so release-style traces could continue

This timing sensitivity is an important part of the bug story.

## Core Files

Core implementation:
- `utils/mapTrace.ts`

Viewer:
- `components/debug/MapTracePanel.tsx`

Main map instrumentation:
- `app/(tabs)/map.tsx`

Additional instrumentation:
- `hooks/useHotspotHighlight.ts`
- `components/map/EventCallout.tsx`
- `components/map/FilterPills.tsx`
- `components/map/MapLegend.tsx`
- `components/map/InterestsCarousel.tsx`

Related docs:
- `docs/MAP_CALLOUT_PRODUCTION_BUG_HANDOFF.md`
- `docs/MAP_CLUSTER_INTERACTION.md`

## What The System Does

The trace system provides:
- ordered event breadcrumbs
- a snapshot of current app state
- synchronized cross-system sampling
- a hidden on-device viewer
- export via iOS share sheet

## Main APIs

In `utils/mapTrace.ts`:
- `traceMapEvent(label, details?)`
- `setMapTraceSnapshot(partial)`
- `clearMapTrace()`
- `formatMapTraceExport()`
- `useMapTraceState()`
- sampler registration helpers used by the newer synchronized tracing

## Hidden Debug UI

The trace panel lives in:
- `components/debug/MapTracePanel.tsx`

It was exposed through a hidden trigger:
- long-press on the bottom-left GathR logo area on the map screen

The panel supports:
- viewing recent trace entries
- viewing the current snapshot state
- clearing logs
- sharing logs through the iOS share sheet

## Current Flags

At the time of this handoff, `utils/mapTrace.ts` is set to:

```ts
export const MAP_TRACE_ENABLED = true;
export const MAP_TRACE_UI_ENABLED = MAP_TRACE_ENABLED;
```

When disabled:
- `traceMapEvent(...)` becomes a no-op
- `setMapTraceSnapshot(...)` becomes a no-op
- hidden debug UI does not render

## Why This Was Necessary

The bug kept changing shape depending on release timing.

The trace system let us answer:
- Did the hotspot tooltip tap really fire?
- Did cluster selection state really change?
- Did `EventCallout` really mount?
- Did the outer callout animation really finish?
- Were `FilterPills`, `MapLegend`, or `InterestsCarousel` truly opening, or only appearing visually corrupted?

## Event Logging

Examples of event breadcrumbs:
- `marker_press_started`
- `marker_press_selected`
- `callout_selection_state_changed`
- `callout_animation_request_started`
- `callout_animation_open_started`
- `callout_animation_open_waiting_for_mount`
- `callout_animation_open_next_frame`
- `callout_open_animation_finished`
- `hotspot_tooltip_tapped`
- `hotspot_tooltip_selected_cluster`
- `event_callout_rendered`
- `event_callout_on_layout`
- `map_press_fired`
- `map_press_closing_callout`

These were used to determine:
- whether the tap path failed before selection
- whether the callout mounted at all
- whether the failure was before render, during render, or after render

## Snapshot State

Snapshot state was used for values like:
- `clustersReady`
- `isLoading`
- `ignoreProgrammatic`
- `isCalloutOpen`
- `selectedVenueCount`
- `renderedCalloutVenueCount`
- `activeFilterPanel`

This answered:
- what the app believed was true at the moment logs were shared

## Cross-System Samplers

Later in triage, normal event logging was not enough.

The user visually saw:
- the Specials drawer shell
- the Map Legend shell
- the InterestsCarousel handle/shell

But the normal open handlers for those systems were not firing in logs.

To diagnose that, synchronized samplers were added.

Providers:
- `map_callout`
- `filter_pills`
- `map_legend`
- `interests_carousel`

Typical trigger labels:
- `trace_sampler_snapshot trigger=callout_animation_request`
- `trace_sampler_snapshot trigger=callout_animation_probe`
- `trace_sampler_snapshot trigger=callout_animation_finished`

Those snapshots captured the visual-state values of all relevant systems at the same timestamps.

This proved an important point:
- `FilterPills` was not truly opening
- `MapLegend` was not truly opening
- `InterestsCarousel` was not truly opening

So the bad screen was visual/state corruption, not a normal open-state transition for those systems.

## Export Format

Shared logs are plain text with:

1. `MAP TRACE`
- ordered timestamped event list

2. `STATE`
- current snapshot key/value list

This format was chosen because it is easy to:
- email from iPhone
- paste into chat
- compare across runs

## Most Important Historical Note

There was a `preview` period where the bug appeared fixed.

Then:
- the trace system was disabled during cleanup
- the bug appeared to return

That does not prove tracing itself fixes the bug.
It strongly suggests the bug is timing-sensitive and that removing trace overhead changed release behavior enough to expose it again.

Any future AI or engineer should treat that as a major clue.

## If Another AI Needs This

Recommended startup order:
1. Read `docs/MAP_CALLOUT_PRODUCTION_BUG_HANDOFF.md`
2. Read this doc
3. Check whether tracing is currently enabled in `utils/mapTrace.ts`
4. Review the latest shared logs:
   - `log.txt`
   - `Log 2.txt`
   - `Log 3.txt`
5. Reproduce in a `preview` build, not a dev build

## Summary

The trace system is not just a debug panel.

It became the main diagnostic framework for this bug because it could:
- capture release-style event order
- preserve current state
- compare multiple overlay systems at once
- export logs from device to chat

At the time of this handoff, it should be considered part of the active debugging setup, not legacy cleanup leftover code.
