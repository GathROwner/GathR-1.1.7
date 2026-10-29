# Listing video app pilot

Recovered release candidate on exact live Preview commit `b27a8081331ff5739f066ba607ddcbb97510cc6e`, with the video patch cherry-picked cleanly. No native dependency or configuration changes. Detailed backend policy and validation are at `C:/Users/craig/.codex/worktrees/listing-video-pilot/docs/listing-video-pilot.md` and `listing-video-validation.json`.

Events, Specials and the shared event lightbox now include a conditional play control. Image galleries remain images. Availability requests are small, batched, deduplicated and cached briefly; video bytes are not requested until a play tap. The full-screen player uses the existing WebView native module, contains navigation to the managed MP4 namespace, starts muted, supports native video controls and unmounts on close/background. Missing, expired, malformed or failed media leaves the existing photo. Private shared events and friend-event data are never sent to the public video manifest endpoint.

App lookup is disabled unless `EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED=true`. The independent server flag also defaults off. This is a manual reviewed pilot, not automatic acceptance of scraped videos.

Validation: seven focused tests passed, TypeScript passed, lint exited zero with zero errors and 215 existing-repository warnings. Includes no-player-before-tap, close/background/error teardown, managed-URL limits and request deduplication. No real venue video has yet been reviewed or published.

Source recovery is complete: both saved bundles in `C:/Users/craig/Documents/Codex/2026-10-21/task/` verified, the base was imported before the candidate, and the video patch applied cleanly. Ancestry and unchanged native dependencies/configuration were independently checked. Recovery evidence is in the backend `docs/listing-video-app-source-recovery.json`. Fresh EAS readback still points to the recovered b27a808 release. The clean candidate passed TypeScript, seven focused video tests and iOS Preview auth/social/Mapbox preflight. No OTA was published.

The emulator remains a separate visual/playback gate. Its debug server was unresponsive; recovery preserves installed app data, accounts and the existing s24 AVD. No map interaction, native build, replacement APK, live listing mutation or Production release is authorized by this QA work.

Next: obtain actual visual/playback evidence, complete the reviewed real-video pilot and backend gates, then publish iOS Preview under the existing release workflow. No device adoption claim follows from automated tests or preflight.
