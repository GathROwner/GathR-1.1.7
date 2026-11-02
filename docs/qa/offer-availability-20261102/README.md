# Bound multi-day offer availability consumer

Built from iOS Production source `ca4bdd52dd563ee2c40546e4625ae8657bce1c49` (runtime 1.1.20), on the isolated `codex/nov2-special-hours-consumer` branch. No release or native configuration changes are included.

The app consumes the producer's `timing.availability` version 1 / `offer_availability` child only when the separate `event.offerAvailabilityBinding`, canonical venue/date bounds, source-ID union, eligible offer semantics, service identity, source freshness and interval rules agree. Missing, stale or mismatched proof retains the original date-only offer and blank legacy clocks. The consumer shared interfaces match the producer schema; constructor-only parser types are omitted.

Selected dates and full bounded ranges share one evaluator across timing rows, status, filters and counts. Unknown dates remain visible; known closures are excluded from selected-day browsing, while ALL retains the parent. Prior service-day overnight tails and split periods remain distinct. Final-date windows stop at midnight. Inferred windows never grant confirmed Now. Usual weekly hours remain informational. The calendar opens a source-choice prompt without creating a multi-day timed appointment. Existing gallery visitingHours v1 and ordinary timing behavior remain intact.

The normalizer now retains the independent binding and source-ID union; persisted query keys are versioned accordingly. The status cache observes content, revision, source binding, timezone, interval, date, expiry and backward-clock transitions. Validated evidence is reused across consumers without network requests.

## Validation

TypeScript passes. The focused regression run passes 97 tests in 12 suites (offer fixtures; gallery; date-only; schedule cache; calendar; shared timing/badge; selected filter context; campaigns; API capability; persisted query hydration). A final 4-suite pass rechecks the refreshed producer eventFields fixture. ESLint has no errors; existing file-wide warning output is retained in the external evidence directory. `git diff --check` passes. An older badge fixture now uses a fixed October 25 clock so its campaign assertion does not expire with wall time.

External evidence: `C:/Users/craig/Documents/Codex/2026-11-02/followups/frontend-hours/`. The final result and freeze receipts record exact commits, source/test/render hashes, commands and limits.

## Rendered review

Eight 390px-wide fixtures show the **actual production parent JSX and styles** from Specials `contentSection` and lightbox `infoContainer`, with the actual shared timing components, MaterialIcons component/font, and existing source/report controls. The harness extracts those subtrees directly from source; it does not reproduce the layout by hand. It renders a light card and collapsed/expanded dark lightbox rows. Selected filters and the already-loaded Expo font provider are fixtures. The large-text variant scales RNW Text to simulate native 160% font scaling; icons keep production no-scaling behavior.

Open, closed, unknown holiday, midnight overnight, range, split periods, known tail with unknown daytime, and 160% text were each visually inspected. Clocks and badges remain complete, hierarchy and margins follow production, and the disclosure stays readable. Repeated `(estimated)` wording is omitted only where an adjacent estimated badge supplies it; rows without that badge retain the qualifier. Overnight text may wrap in the narrower lightbox row. No horizontal overflow was observed.

- [Selected open](selected-open.png)
- [Selected closed](selected-closed.png)
- [Unknown holiday](unknown-holiday.png)
- [Overnight](overnight.png)
- [Range](range.png)
- [Split periods](split.png)
- [Unknown with tail](unknown-with-tail.png)
- [160% text](large-font-160.png)

Reproduce with `scripts/render-offer-availability-parents.cjs`, an output directory, and the installed Playwright package path. `OFFER_RENDER_CHROMIUM` may point to an existing Chromium executable. The receipt records source subtree and image hashes. RNW warns about existing shadow/pointerEvents props and empty-string conditional children; the screenshots contain no visible missing text or icons.

These are isolated actual-component renders, not native full-screen, device-adoption, map, ads or check-in evidence. No emulator or app was opened. The coordinator must independently review the frozen images and combined integration candidate before release. Parser activation, Greco data repair, API deployment and device adoption remain outside this change.
