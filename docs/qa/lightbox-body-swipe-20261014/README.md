# Callout lightbox title and description paging

Accepted source baseline `6a773bf1d2ecb0fd9eeb80fdfaa8540fffaf93b7`; live iOS Preview independently refreshed to group `0d846e30-46e9-4c85-b192-dbc349cec9f6`, update `01a13bca-33bb-79e0-9378-278d6ab463d9`, release commit `f136c49833ec7544032c83826c146bff0ff59f98`, runtime 1.1.10.

## Change

One horizontal native pan handler now surrounds the current page (media, title, badges/timing, description), instead of only the media. The existing native page translations, animation timings, bounds, handoff covering and Reduce Motion logic are retained. The separate vertical dismissal handler remains media-only. Header and bottom actions are outside paging.

The title and description gesture ScrollViews wait for that horizontal handler to resolve direction, allow interruption and use directional locking in callout mode. A vertical movement fails horizontal recognition and proceeds to scrolling; sideways movement pages. Non-callout paths receive no new scroll props: explicit `undefined` would override RNGH's configured `disallowInterruption: true`, so conditional spreads preserve those defaults. No native/dependency/config or backend changes.

## Rendered native verification

Reused the existing s24 debug client, package `com.craigb.gathr`, runtime 1.1.10. Independent local dependencies passed Metro preflight, `run-as` succeeded, and the exact source worktree served a fresh Android bundle (2377 modules with the isolated root). Real EventCallout fixture and minimal root from `../callout-lightbox-paging-20261014/`; map route was an empty View throughout. No map mounted or interacted with. No APK replacement/data clear, backend deployment or live event writes. The initial cold boot had Android System UI/app ANRs and a development connection timeout; dismissal and force-stop/relaunch recovered. Failed startup captures remain in Temp and are excluded from acceptance evidence.

Reviewed native screenshots and the title-swipe recording/frame sheet:

- `01-title-next.png`: 120-pixel (40-point) left swipe beginning on title advances Event 1/3 to 2/3. Long title and gallery remain aligned.
- `02-description-previous.png`: right swipe beginning on description returns to Event 1/3.
- `03-description-scroll.png`: vertical upward description drag stays on 1/3, moves to paragraphs 3/4 and enters the existing reading mode.
- `04-description-next-after-scroll.png`: horizontal swipe while reading advances to 2/3, resets description to paragraph 1 and restores event details.
- `05-title-previous.png`: title right swipe returns to 1/3.
- `06-description-down-stays-open.png`: downward description drag at the top neither closes nor changes event.
- `07-hero-close.png`: downward media drag closes back to the original callout.
- `08-special-description-next.png`: description left swipe advances Special 1/2 to 2/2.
- `09-special-boundary.png`: another title left swipe stays on 2/2; no wrap or venue/tab change.
- `10-hero-still-pages.png`: media right swipe returns to Special 1/2.
- `11-photo-tap.png`: media tap still opens the photo viewer.
- `title-swipe.mp4`, `title-swipe-frames.png`: inspected in frame order, left-to-right across rows. Fixed venue header/footer, translated page content, smooth existing commit/handoff, no old-event flash. Unfilled black contact-sheet cells are padding, not blank app frames.

All three temporary app files restored byte-for-byte using recorded hashes; copied QA environment removed after matching its original hash; app force-stopped, Metro and task-launched emulator stopped before restoration. Normal app TypeScript, focused Jest and lint are checked separately for release. Android debug evidence proves shared JS behavior, not iOS device adoption; Craig's iPhone verification remains separate.
