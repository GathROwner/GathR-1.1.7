# Listing video refinements - October 29

Status: PUBLISHED AND INDEPENDENTLY VERIFIED on iOS Production. Source 4176896; runtime 1.1.20; update 01a188f6-f176-7ce0-968e-8967db5cf856; group 40a99276-3c32-4cd7-a03d-7a217c5d7d03. Physical iPhone adoption pending. Craig accepted autoplay Production OTA 01a188ba, then authorized this OTA-compatible refinement batch. Working branch `codex/listing-video-refinements-20261029` in `C:/Windows/System32/GathR-Project/video-production` descends from accepted Production dd8a943 and its 23528ce documentation. Current rollback is group `b46ce890-450f-43d9-9f9d-82e4b64912bf`, runtime 1.1.20.

## Resulting behavior

The intentional poster dwell is one second. A completed clip stays on its poster while it remains onscreen; after all representations actually leave the screen, completion resets and returning cards can autoplay again. A partial visibility change alone does not reset completion. Explicit Replay starts inline immediately, including with autoplay disabled or Reduce Motion enabled, while preserving focus/foreground/visibility requirements and one-player priority. Tapping the playing image still expands it.

The fullscreen viewer uses the entire viewport with an original-poster blur backdrop and floating safe-area-aware sound, Fit/Fill, Close, play/pause, title and progress controls. It has no separate header/footer bands. The actual decoded videoWidth/videoHeight determine portrait, square or landscape layout; object-fit contain preserves the full source by default. Fill screen explicitly chooses cropping; Fit frame restores containment without changing the source or playback position. Controls fade while playing and reappear on tap/pause/end. A deliberate downward swipe dismisses the viewer; horizontal gestures and control/seek gestures are excluded. Close and Escape remain available. Progress is retained when expanding/closing.

VIDEO-NATIVE-001 records volume adjustment unmuting as a potential native-build follow-up in `listing-video-native-followups.md`. No new native dependency, plugin, configuration, permission, paid build or hardware-volume simulation is included.

## Validation and scope

Twenty-five focused checks passed: thirteen coordinator/metadata, six React lifecycle, six fullscreen DOM interaction tests. These cover scroll-return completion reset, duplicate representations, explicit inline priority, preference/Reduce Motion behavior, one-second dwell, actual metadata aspect classification, same-player Fit/Fill/seek/pause/sound, downward versus horizontal/control gestures, accessible dismissal and title escaping. TypeScript passed including final no-auto-inset props. Full lint passed with zero errors and 221 existing repository warnings; final changed component/player lint was clean.

Actual native isolated-screen evidence for the two existing approved public clips was inspected for inline Replay, actual scroll-away/return, square and landscape fitting, seeking, Fit/Fill switching and swipe-down close during playback. The current native package and app data were retained; no auth/map/ad/live data interaction, media upload, source-content alteration or backend/parser/gate work occurred. Proof and exact source hashes: `docs/qa/listing-video-refinements-20261029/QA_RECEIPT.json`. This is shared-JS evidence from Android, not physical iOS adoption or a complete live app route audit. Portrait classification is covered by metadata/DOM tests; no new portrait clip was published solely for QA.

Temporary package entry restored exactly, own Metro stopped, reverse port8093 removed. Production publication passed fresh source/branch/runtime/channel/environment/Mapbox guards and independent final EAS readback. The separate October 29 full parse audit remains outstanding.

## Release evidence

Exact source `41768963d92d4db7fbcdc5587548d6edefc5895f` published to iOS Production runtime **1.1.20**; update **01a188f6-f176-7ce0-968e-8967db5cf856**, group **40a99276-3c32-4cd7-a03d-7a217c5d7d03**. Independent EAS view/list/channel confirm newest iOS update, exact source, active full Production routing and unchanged native fingerprint `6baab265658bbf45b6735e70da70e3a41bfabd41`. Full clean export: **2,551 modules**, **112 final EAS iOS assets**. No new native module, dependency, permission, configuration or build was needed. Production social/auth/App Check/Mapbox settings and accepted source ancestry are preserved.

Detailed receipt: `listing-video-refinements-release-20261029.json`. Source and exact recovery bundle are retained. Rollback is `b46ce890-450f-43d9-9f9d-82e4b64912bf`. Phone check: close/reopen twice and confirm Profile OTA **01a188f6**, then try inline Replay, scroll-return, fullscreen Fit/Fill and swipe-down close. The native-volume follow-up remains tagged, without triggering a native build.
