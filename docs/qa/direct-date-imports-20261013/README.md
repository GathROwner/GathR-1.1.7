# Direct date-function imports

Approved scope: a contained import optimization, preserving all date/timing behavior. Source baseline `d0a9b97`; live iOS Preview baseline `51508b8a559145c0c6e8863326ab5848a2ed9fed`, runtime 1.1.10, group `a735c903-b16a-455d-aa25-b39c4c1afb5c`. The accepted Upcoming date preview, image compression and icon-family optimization remain part of the baseline.

Only eight import bindings in two files change. `utils/dateUtils.ts` imports format, parseISO, parse, isValid, isWithinInterval and isSameDay through their supported date-fns 4.1.0 subpaths; `app/attendance-survey.tsx` imports format and parseISO through the same subpaths. Names, calls, arguments, formats, date parsing/fallthrough, event ordering, timezone decisions, re-exports and component bodies are unchanged. Removing import declarations from both files yields exactly the same bodies and exports as Git baseline. No dependency/lockfile, native/config/runtime, assets or backend changes.

Both CommonJS and ESM checks independently confirm all six subpath function objects are strictly identical to their root-entry counterparts. The installed library's export map supports the function paths; its root entry reexports the same implementation modules. See [the pinned library source](https://github.com/date-fns/date-fns/blob/v4.1.0/src/format/index.ts).

## Validation

TypeScript passed. Source lint passed with zero errors / 213 existing warnings. Eleven focused suites / 98 tests passed under America/Halifax, covering parsing/time formats, timing/unknown ends, expiry, series, schedule caching, Upcoming windows and date labels, time badges/text, filter-panel behavior and Firestore timing-field mapping. UTC yielded 91 passes / 7 failures; all seven are old dateUtils test assumptions based on device-local fake time while event timing uses Halifax. The unchanged live release reproduces the same seven failure names/first diagnostics (7 failed / 8 passed in that suite), recorded in `utc-baseline.json`. No timing code or unrelated test fixture was changed to make those tests pass.

This is not visual/UX work: no JSX, styles or formatted-output logic changed. No emulator/map interaction or new native visual validation was performed; existing screenshots are not presented as fresh evidence. Function-identity checks, unchanged-body comparisons, rendered-component date assertions and timing tests provide the parity evidence for this import-only change. Physical iPhone adoption/rendering remains separately unverified.

`export-before.json` captures the current live iOS payload: 108 unique assets / 30,190,921 asset bytes, 5,785,656 Hermes bytecode bytes, 2,705 Metro modules and 304 date-fns source-map entries. Final measurements, resource comparison, preflight and publication state are recorded in RELEASE.md. Exported byte counts exclude diagnostic source maps and do not measure store-download or installed-binary size.
