# Participation hunts and linked festival programmes

Candidate prepared for independent review; STOP before OTA publication.

## Accepted baseline and source design

- Branch: `codex/area-hunt-presentation-20261016` in `C:\Users\craig\.codex\worktrees\area-hunt-presentation\GathR-upgrade-sdk54`.
- Runtime change commit: `571ed2db8c7199f46c1ab88c2e9233e083d14702`.
- Accepted live iOS Preview base: `3f7659d10bc6952d4004b2d507b999db3c87cbd7`, group `6d7b29a3-e089-4d91-8374-6f88a7d6e506`, update `01a144c6-8159-7270-9ede-703a8257d48b`, runtime `1.1.10`. Refreshed list/view before edits confirms this exact baseline.
- The reusable display helper checks existing normalized public title, description and area locations. Explicit linked IDs anywhere take precedence, even if all linked activities are expired or unavailable. Zero available children never establishes participation mode.
- Affirmative hunt mode requires a specific hunt identity, source instructions to take a photo or collect/solve clues, explicit distributed participation evidence, multiple drawable area locations, and no contradictory separately scheduled programme/negated-hunt evidence. No venue names, production IDs or stored classification flags are used.
- Unlinked festivals retain the existing programme explanation. Ambiguous/unrelated areas get neutral location details. Route and venue-scoped events do not receive hunt presentation.
- Hunt locations show the existing clean umbrella/point instructions, available address, certainty, access-hours advice and source attribution. They omit the misleading zero-programme section/refresh control.
- Unknown-clock hunt timing displays “Check location opening hours.” This override is confined to the shared text component and corresponding lightbox report text; the general date utilities, stored timing, eligibility, expiry and calendar behavior are unchanged. Observed clock text is not replaced.
- Exactly four runtime files changed: `utils/areaEventPresentation.ts`, `components/map/AreaLocationBrowser.tsx`, `components/common/EventTimingSummaryText.tsx`, `components/map/EventImageLightbox.tsx`. Cache/query flow, APIs, native dependencies/configuration, backend services and live data are unchanged.

## Native visual evidence

All eleven PNGs are unedited `1080x2400` framebuffer captures from the existing Android debug client, `emulator-5554`, package `com.craigb.gathr`, version `1.1.10 (13)`, runtime `1.1.10`. Metro served this worktree; the fixture visibly identifies `571ed2d`, with a fresh 2,367-module Android request. This proves shared JavaScript rendering and behavior, not iOS device adoption.

The standalone fixture uses synthetic public-shaped records and a private in-memory query client. Map entrypoint was disabled and never operated. No live event IDs, backend changes, Firestore writes, model calls, APK replacement or data reset were used. Standard lightbox guest gating remains visible; authenticated description/actions were not tested. The overview invokes one controlled fixture hydration callback, which performs no network request; linked-card navigation stays at zero requests and zero hydration.

| PNG | Observed behavior |
| --- | --- |
| `01-hunt.png` | Selfie-hunt instructions, participating location, address/source; no false missing programme. |
| `02-clue-hunt.png` | Different named clue hunt gets the same generic participation treatment. |
| `03-unlinked-festival.png` | Real unlinked festival keeps its honest zero/unlinked-programme explanation. |
| `04-neutral-area.png` | Unrelated area shows neutral event-location details. |
| `05-linked-cached.png` | Two cached linked cards, zero requests/hydration. |
| `06-linked-open.png` | Existing standard lightbox opens Event 1/2. |
| `07-linked-next.png` | Horizontal title swipe advances to Event 2/2. |
| `08-linked-return.png` | Venue-header swipe down returns to both cards, still zero requests/hydration. |
| `09-hunt-overview-timing.png` | Full-screen standard overview shows original dates and “Check location opening hours.” |
| `10-long-hunt-header.png` | Long two-line venue name and source-length umbrella/point instructions wrap cleanly. |
| `11-long-hunt-scroll.png` | Description scroll retains header and exposes full access advice/source attribution. |

The saved `fixture.tsx.txt` is documentation only. The temporary runtime module was removed and normal root/index/map files restored byte-for-byte; see `restoration-proof.json`. Task-owned Metro and app were stopped, and the pre-existing emulator left running.

## Validation and handoff

- Final restored-route Jest run: **9 suites / 105 tests pass**, covering new classifier/UI/normalization cases and existing cached loading, request limits, precedence, removals, paging, timing and route behavior.
- Source normalization tests cover both top-level and `metadata.areaData` API shapes, preserving the full public instruction text and locations. Existing minimal/detail/store paths retain those fields; no normalization implementation was changed.
- TypeScript, full lint and iOS Preview auth/social/Mapbox/export evidence are recorded in the final export report after completion. Command logs live under ignored `artifacts/area-hunt-presentation-20261016/`.
- Family-friendly labels and reverse festival/hunt membership navigation remain separate follow-ups.
- No publication is authorized at this preparation gate; parent must independently review the clean export/source map first.
