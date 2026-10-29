# Poster-first listing video autoplay candidate

Status: implemented, behavior-tested, UNPUBLISHED. Native rendered visual acceptance remains blocked. No backend, Firestore, media upload, parser, gate, traffic, native package or Android release changes.

## Accepted scope and baseline

Craig authorized trying the discussed poster-first experience after confirming the existing Production video feature works. Branch `codex/listing-video-autoplay-20261029` starts at accepted documentation descendant `5a37b4fcd722f2b4d64eee01997e0d63cf37bff1`; it includes Production runtime source `a14cffe1a7e432ce1301afa7bd1506f8bca45f5f` and its newer accepted gesture/header fixes.

Current rollback is iOS Production group `a7f701ad-64e5-48bb-a53d-c150afa98037`, update `01a18865-96db-7e0d-91d9-064c4e42ea58`, runtime 1.1.20. No candidate export/publication has been performed. Re-read the live baseline immediately before any eventual release.

## Resulting behavior

- Original poster/gallery renders immediately; after two settled seconds with at least 75 percent of the image visible in both axes, an approved clip starts muted and fades in only after its first frame.
- A shared coordinator allows only one inline listing player, gives open details priority, and excludes fullscreen playback. Scrolling, backgrounding, unfocus, covered details and disabled preferences stop or prevent inline playback.
- Small pause and sound controls sit at lower left. Tapping a moving clip opens the existing fullscreen player from its remembered position; explicit playback still works with autoplay disabled.
- At clip end the original poster returns with Replay. Completed clips remain manual replay for this session. Original images and event metadata are retained.
- A device-local Autoplay videos preference persists without cloud writes. Reduce Motion and unfinished preference hydration prevent autoplay. Missing, expired or failed media leaves photos available. The existing source namespace and expiry checks remain in force.
- This coordinates GathR listing videos only; it does not control the advertising SDK. No automatic video selection or approval is added.

## Review and checks

Source review covered exact-path metadata, restricted immutable URLs/CSP, bounded progress/completion maps, delayed native-player allocation, foreground/focus/detail suppression, both-axis visibility and original gallery preservation. The metadata transport is unchanged. No dependency/native configuration changes.

Seven coordinator/HTML tests and four existing metadata/helper tests passed. Five component lifecycle tests passed, including the two-second poster dwell, one inline WebView, pause/resume without source restart, end-to-poster Replay, preference hydration, Reduce Motion, manual expansion, background shutdown and photo fallback. The initial new lifecycle failure was traced to React Native Jest's no-op measureInWindow stub; supplying an actual measured rectangle fixed the test. TypeScript passed. Full lint passed with zero errors; changed video modules/tests pass focused lint with zero warnings after import-order cleanup. Logs are retained locally under qa-artifacts/autoplay/.

## Required next step and blocker

Automatic approval review rejected the combined existing-emulator launch and isolated QA setup command before execution, with `blocked by policy` and no stated reason. None of that command ran. No alternative launch, connection or workaround has been attempted. Craig has been asked for direction on starting the preserved existing emulator and connecting only to an isolated cards/video screen, with no maps or ads.

Native screenshots and actual scrolling/playback verification are still absent for this autoplay candidate. Earlier tap-to-play screenshots, generated mockups and passing tests do not supply that evidence. Stop before publication until the rendered check is possible or Craig explicitly directs otherwise.

Then: run isolated native poster-to-play/end/pause/sound/offscreen/detail/fullscreen/preference checks, independently inspect the screenshots, restore any QA-only entry exactly, run release guards and a clean iOS Production export from the committed candidate, verify compatible native fingerprint, publish once within existing authority, and independently read back the exact iOS Production update/channel/runtime. Preserve the current Production environment, App Check settings, social flags and Mapbox token. Do not publish a staging QA entry.

The October 29 full source-to-output regular parse audit is a separate outstanding task; it has not been completed by this UI change.
