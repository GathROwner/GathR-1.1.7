# Listing video app pilot

Additive local implementation on accepted commit `0f570dfc349bd812ced6df38242068df04687814`. No native dependency or configuration changes. Detailed backend policy and validation are at `C:/Users/craig/.codex/worktrees/listing-video-pilot/docs/listing-video-pilot.md` and `listing-video-validation.json`.

Events, Specials and the shared event lightbox now include a conditional play control. Image galleries remain images. Availability requests are small, batched, deduplicated and cached briefly; video bytes are not requested until a play tap. The full-screen player uses the existing WebView native module, contains navigation to the managed MP4 namespace, starts muted, supports native video controls and unmounts on close/background. Missing, expired, malformed or failed media leaves the existing photo. Private shared events and friend-event data are never sent to the public video manifest endpoint.

App lookup is disabled unless `EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED=true`. The independent server flag also defaults off. This is a manual reviewed pilot, not automatic acceptance of scraped videos.

Validation: seven focused tests passed, TypeScript passed, lint exited zero with zero errors and 215 existing-repository warnings. Includes no-player-before-tap, close/background/error teardown, managed-URL limits and request deduplication. No real venue video has yet been reviewed or published.

Release blocked: live iOS Preview group `4fe3d163-cf5a-4bad-be8e-361021eea5db` names commit `b27a8081331ff5739f066ba607ddcbb97510cc6e`, absent from the authoritative local repository and origin. Do not release this older source over the live check-in fixes. The s24 screenshot timed out and adb app probe hung, so actual rendered layout and playback remain unverified. Preserve app data; no map testing, native rebuild, APK replacement, OTA or Production action occurred.

Next: recover the live source, apply only this additive patch, obtain real visual/playback evidence, complete backend/source-media pilot gates, then publish iOS Preview under the existing release workflow. No device adoption claim follows from automated tests.
