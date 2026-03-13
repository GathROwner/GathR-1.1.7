# Map Callout Production Bug Handoff

## Current Status

This bug is not resolved.

It is a release-style iOS bug that reproduces in `preview` builds but not in normal development builds.

Important recent history:
- There was a period where `preview` testing appeared fixed.
- The trace system was then disabled during cleanup.
- After that cleanup, the bug returned in `preview`.
- Re-enabling the trace system did not fix the bug, but it did confirm that timing is a major factor.

As of March 12, 2026, the bug is still under active triage.

## Core User Symptom

Main symptom:
- User taps a map cluster or hotspot tooltip.
- The app appears to begin opening the venue callout.
- The expected callout does not appear correctly.
- The app can enter a corrupted UI state afterward.

Observed user behaviors:
- Hotspot tooltip tap should open the hotspot cluster callout, but often does not.
- Later cluster taps can reproduce the same broken state.
- "View all events at this venue" from the event-image lightbox can also trigger the same bad UI state.
- While the app is in the bad state, tapping `Events` can lead to a blank white screen and tab bar corruption.

## Important Constraints

- Reproduced as a registered user, not a guest limitation issue.
- Reproduces in `preview` iOS builds.
- Does not reproduce in normal development builds.
- Normal `console.log` is not sufficient because this is release-style behavior.
- The user's backup route file `app/(tabs)/map - Copy.tsx` must be left alone.

## Why Logging Was Added

The bug kept changing shape depending on release timing.

We added in-app tracing to answer:
- Did the tap handler fire?
- Did store selection state change?
- Did the callout component mount?
- Did the outer callout animation actually finish?
- Were other overlay systems really opening, or only appearing visually corrupted?

This trace system became necessary because:
- release builds do not behave like dev builds
- timing changes mattered
- exporting logs from device to chat was the only reliable way to compare event order

## Current Trace System

See also:
- `docs/MAP_TRACE_SYSTEM.md`

Main files:
- `utils/mapTrace.ts`
- `components/debug/MapTracePanel.tsx`
- `app/(tabs)/map.tsx`
- `hooks/useHotspotHighlight.ts`
- `components/map/EventCallout.tsx`
- `components/map/FilterPills.tsx`
- `components/map/MapLegend.tsx`
- `components/map/InterestsCarousel.tsx`

Current state:
- tracing is enabled again
- hidden trace UI is enabled again
- the trace buffer was expanded
- cross-system samplers were added

The logo long-press debug panel was used to:
- clear logs
- share logs through iOS Mail
- paste logs back into chat

## What Has Been Logged And Why

### Map / cluster / callout logs

Logged to prove event order:
- `marker_press_started`
- `marker_press_selected`
- `callout_selection_state_changed`
- `callout_animation_request_started`
- `callout_animation_open_started`
- `callout_animation_open_waiting_for_mount`
- `callout_animation_open_next_frame`
- `callout_open_animation_finished`
- `callout_animation_close_started`
- `callout_close_animation_finished`
- `map_press_fired`
- `map_press_closing_callout`

Purpose:
- determine whether the cluster path failed before selection, during selection, or after render

### Hotspot logs

Logged to trace the startup hotspot path:
- `hotspot_trigger_started`
- `hotspot_camera_animation_started`
- `hotspot_visible`
- `hotspot_tooltip_tapped`
- `hotspot_tooltip_selected_cluster`

Purpose:
- confirm whether hotspot tooltip tap really selected the intended cluster

### EventCallout logs

Logged to prove mount/layout:
- `event_callout_rendered`
- `event_callout_on_layout`

Purpose:
- distinguish "callout never mounted" from "callout mounted but was not visibly usable"

### Overlay-system logs

Logged because the user visually saw the Specials drawer, Map Legend, and InterestsCarousel shell during failures:
- `filter_panel_toggle_requested`
- `filter_panel_changed`
- `filter_panel_visual_state_changed`
- `filter_panel_visual_value_sampled`
- `map_legend_button_pressed`
- `map_legend_open_changed`
- `map_legend_visual_state_changed`
- `map_legend_visual_value_sampled`
- `interests_carousel_state_changed`
- `interests_carousel_value_sampled`

Purpose:
- determine whether those systems were truly opening through normal state paths, or only appearing visually corrupted

### Cross-system synchronized sampler

Added later because single-point logs were not enough.

Sampler providers:
- `map_callout`
- `filter_pills`
- `map_legend`
- `interests_carousel`

Trigger types:
- `trace_sampler_snapshot trigger=callout_animation_request`
- `trace_sampler_snapshot trigger=callout_animation_probe`
- `trace_sampler_snapshot trigger=callout_animation_finished`

Purpose:
- capture all relevant UI systems at the same time after a callout-open request

## What The Logs Proved

### Things that were ruled out

The logs ruled out these as the primary cause:
- guest restrictions
- missing hotspot target selection
- simple "tap never fired"
- simple z-index problem
- `FilterPills` truly opening through its normal `specials` state path
- `MapLegend` truly opening through its normal button/open state path
- `InterestsCarousel` truly opening through its normal visible state path
- root `app/_layout.tsx` or `app/(tabs)/_layout.tsx` as the main source of the map callout bug
- obvious server fetch failure in the lightbox "View all events at this venue" path

### Important proof about local vs server data

The "View all events at this venue" path in `components/map/EventImageLightbox.tsx` does not fetch from the server. It already has `venue` and `cluster` in memory and directly calls:
- `selectVenues(sortedVenues)`
- `selectCluster(cluster)`
- `selectVenue(venue)`

That strongly suggests the failure is in UI presentation/state, not missing venue data from the backend.

### Strongest current findings

1. `EventCallout` mounts.
- We repeatedly saw `event_callout_rendered`
- We repeatedly saw `event_callout_on_layout`

2. The outer callout wrapper was originally starting its spring before the wrapper existed.
- This led to the "mount -> next frame -> animate open" fix attempt.

3. After that fix, `Log 3.txt` showed the outer wrapper spring now completes.
Important lines:
- `callout_animation_open_waiting_for_mount requestId=2`
- `callout_animation_open_next_frame requestId=3`
- `callout_open_animation_finished requestId=3 finished=true`
- synchronized sampler later showed `provider=map_callout ... calloutTranslateY=0`

Conclusion:
- the outer wrapper open path improved
- but the user still reported no functional improvement

4. The visual "Specials + Legend + carousel handle" state was not backed by their normal open-state transitions.
The synchronized sampler showed:
- `FilterPills` stayed closed
- `MapLegend` stayed closed
- `InterestsCarousel` stayed closed

Conclusion:
- the bad UI state is broader visual/state corruption, not normal opening of those systems

5. The screenshot with a blank white `Events` tab and missing tab buttons suggests navigator or tab-bar UI corruption can happen after the map/callout bug occurs.

## Files Most Relevant Now

Primary files:
- `app/(tabs)/map.tsx`
- `components/map/EventCallout.tsx`
- `components/map/EventImageLightbox.tsx`
- `app/(tabs)/_layout.tsx`

Secondary files:
- `components/map/FilterPills.tsx`
- `components/map/MapLegend.tsx`
- `components/map/InterestsCarousel.tsx`
- `hooks/useHotspotHighlight.ts`
- `utils/mapTrace.ts`

## Important Existing Oddities

### 1. Backup route appears in tabs

There is a visible `map - Copy` route in the tab bar because a backup file exists under `app/(tabs)`.

Do not modify that backup file unless the user explicitly asks.

But be aware that:
- it is a real route in the running app
- it can confuse screenshots and tab-state debugging

### 2. Duplicate custom tab button code

`app/(tabs)/_layout.tsx` contains duplicated / messy `TutorialAware...TabBarButton` definitions.

This may matter because:
- `events` and `specials` use custom `tabBarButton`
- `map` does not
- the white-screen screenshot showed only some tabs still rendering

This does not prove it is the root cause, but it is a real suspect for tab-bar corruption once the UI is poisoned.

## Fixes Already Attempted

### 1. Rendered-callout lifecycle fix

Goal:
- keep callout mounted through close animation
- avoid immediate teardown

Result:
- improved some earlier "one open then dead" cases
- not a final fix

### 2. Re-entry guard

Goal:
- block marker taps while a callout is already rendered/opening

Result:
- improved some earlier re-entry cases
- not a final fix

### 3. Disable trace system during cleanup

Goal:
- leave tooling in codebase but off by default

Result:
- bug appeared to return after cleanup
- likely because timing changed, not because cleanup added business logic

This is an important historical detail:
- there was a `preview` build that looked fixed
- after disabling logging, the bug came back
- re-enabling logging did not restore correct behavior
- this strongly suggests timing sensitivity

### 4. Mount -> next frame -> animate open

Applied in `app/(tabs)/map.tsx`.

Goal:
- make the outer wrapper wait until mounted before starting its spring

Result:
- trace evidence improved
- `callout_open_animation_finished finished=true` appeared
- user still did not see a real functional fix

### 5. Remove outer callout wrapper transform

Most recent attempted fix.

Reason:
- `EventCallout` already manages its own bottom-sheet `translateY`
- `map.tsx` was also applying an outer `translateY`
- double ownership of sheet motion looked suspicious

Before that patch, a backup was created:
- `C:\Windows\System32\GathR-Project\backups\map.tsx.20260312-200004.bak`

This latest patch was not yet fully validated at the time of this handoff.

## Latest Known Log Files

Local log files used during triage:
- `C:\Users\craig\Dev\gathr-apps-script\log.txt`
- `C:\Users\craig\Dev\gathr-apps-script\Log 2.txt`
- `C:\Users\craig\Dev\gathr-apps-script\Log 3.txt`

Most important of these:
- `Log 2.txt`: synchronized sampler proved overlay systems were not really opening
- `Log 3.txt`: proved the mount-first / next-frame outer wrapper spring now completes

## Recommended Reading Order For A New AI

1. `docs/MAP_CALLOUT_PRODUCTION_BUG_HANDOFF.md`
2. `docs/MAP_TRACE_SYSTEM.md`
3. `docs/MAP_CLUSTER_INTERACTION.md`
4. `app/(tabs)/map.tsx`
5. `components/map/EventCallout.tsx`
6. `components/map/EventImageLightbox.tsx`
7. `app/(tabs)/_layout.tsx`
8. `utils/mapTrace.ts`

## Recommended First Questions For A New AI

Before making new broad changes, the next AI should answer:

1. Did the latest "remove outer wrapper transform" patch change the visible behavior?
2. Is `EventCallout` still being pushed or clipped by its own internal `translateY` / state machine?
3. Is the tab-bar corruption tied to the callout failure, or is there a second issue in `app/(tabs)/_layout.tsx`?
4. Is there any interaction between the broken map state and the custom tab-button wrappers for `events` and `specials`?

## Suggested Copy-Paste Prompt For Another AI

Use this as the shortest accurate handoff:

> We have a production/preview-only iOS bug in `C:\\Windows\\System32\\GathR-Project\\GathR` where map cluster callouts fail to appear correctly, especially after hotspot tooltip taps and later cluster or lightbox-to-callout transitions. It does not reproduce in dev builds. We added extensive in-app tracing (`utils/mapTrace.ts`, `components/debug/MapTracePanel.tsx`) because release timing matters. There was a `preview` period where the bug looked fixed, but after cleanup disabled tracing, the bug came back; re-enabling tracing showed it is timing-sensitive. Logs proved `EventCallout` mounts and layouts, and `Log 3.txt` proved the outer wrapper spring now completes after a `mount -> next frame -> animate open` patch, so the remaining bug is likely deeper in `EventCallout` or related UI state corruption, not server data loading. Synchronized samplers also proved `FilterPills`, `MapLegend`, and `InterestsCarousel` were not truly opening through their normal state paths during the bad screen. There is also evidence of tab-bar corruption: while the bug is active, tapping `Events` can produce a blank white screen and hide the custom `events` / `specials` tab buttons. The latest unverified patch removed the outer `translateY` transform from the callout wrapper in `app/(tabs)/map.tsx` because `EventCallout.tsx` already owns its own bottom-sheet motion. Read `docs/MAP_CALLOUT_PRODUCTION_BUG_HANDOFF.md`, `docs/MAP_TRACE_SYSTEM.md`, `Log 2.txt`, and `Log 3.txt` first.

## Bottom Line

The bug is currently best understood as a release-style UI state / animation corruption problem centered on the map callout presentation path.

It is not currently best explained by:
- guest logic
- hotspot data selection failure
- missing server data
- `FilterPills` really opening
- `MapLegend` really opening
- `InterestsCarousel` really opening

The next AI should start from the current trace evidence, not from the earlier assumption that the bug was fixed.
