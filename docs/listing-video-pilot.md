# Reviewed listing videos: iOS Production

Current iOS Production autoplay release: source **dd8a943**, runtime **1.1.20**, update **01a188ba**, group `b46ce890-450f-43d9-9f9d-82e4b64912bf`. Poster-first muted inline playback, controls, opt-out and Replay are now published after native shared-component visual checks. Independent EAS readbacks and unchanged native fingerprint passed; phone adoption is pending. See `listing-video-autoplay-20261029.md` and `listing-video-autoplay-release-20261029.json`.

## Original tap-to-play release


Published October 29 to iOS Production runtime **1.1.20**, preserving the exact accepted Production baseline `875f6302d1ac28842e43cc09bd6fca051ca038a3`. Source `a14cffe1a7e432ce1301afa7bd1506f8bca45f5f`; group `a7f701ad-64e5-48bb-a53d-c150afa98037`; update `01a18865-96db-7e0d-91d9-064c4e42ea58`. Independent EAS view/list/channel readbacks passed. Native fingerprint `6baab265658bbf45b6735e70da70e3a41bfabd41` matches the previous Production update; no native build, dependency or configuration change was required.

Events, Specials and the shared lightbox use a conditional Watch video control over the photo. Playback starts only after a tap and begins muted. Closing/backgrounding removes the player; missing/expired/failed media leaves the existing photo. Exact public listing paths only; private shares/friend paths are excluded. Metadata requests are batched, deduplicated and cached briefly. Existing photos and event records are unchanged.

The two manually reviewed pilot clips are Ben Kunder and Cowboy Christmas. The existing server and scoped daily cleanup were verified in the prior pilot release; this Production port performs no backend deployment, data repair, parser change or gate change. Automatic video selection/approval is not enabled.

Validation: seven video tests, TypeScript, lint (zero errors, 222 repository warnings), exact current Production profile/auth/social/App Check/Mapbox and native fingerprint checks. Full clean export: 2,547 modules and 112 final EAS iOS assets. Video component/helper are byte-identical to the independently reviewed Android native-rendered Preview implementation; those real control/player screenshots were reused with that limited scope. The screenshot mockup is an illustration and is not native acceptance evidence. No physical iPhone adoption/playback or full Production-feed test is claimed. Craig should reopen twice and check Profile OTA `01a18865`, then test Watch video on the two listings.

Detailed proof: `listing-video-production-release-20261029.json`. The previous Production group `4f6c7f70-8da6-4a35-82a2-47b52e5c2307` is retained as rollback. This authorization is for this iOS Production video release; no Android, six-target or native-store rollout is implied.

## Phone acceptance and autoplay follow-up

Craig confirmed the released Watch video feature works in his current Production app and supplied card/lightbox screenshots. This is user-reported playback acceptance; the new OTA footer was not shown in that screenshot set. He then authorized trying poster-first muted autoplay. That separate candidate is tracked in `listing-video-autoplay-20261029.md`; it is not yet published.
