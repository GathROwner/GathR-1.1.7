# List filters include events outside the map view

The Events and Specials tabs count their full unfiltered list partitions rather than the map's on-screen events. Categories therefore remain usable when the viewport contains no matching items, and time/date counts describe the same list. Counts include the full candidate pool beyond pagination and respect saved-only selection. Map callers retain viewport-only counts. Candidate arrays are memoized, with independent weak count caches so list and map renders do not evict one another.

Existing category toggle/clear behavior, outside-map section, sorting, grouping, and pagination remain in place. Events time chips now use their content width in the horizontal scroll row, matching Specials, so larger counts do not wrap.

Validation before release: TypeScript and 66 tests across six suites passed. Six actual production filter panels were rendered with fixture data using React Native Web, exact parent JSX/styles, real category/date components and count function. Independently reviewed empty viewport, selected category, Upcoming, Specials, narrow width and 106-result cases. The resulting pills are legible, aligned, and horizontally scrollable without document overflow. This is component-render evidence, not native-device adoption proof.

See VISUAL_RECEIPT.json for fixture counts and renderer limitations; PNGs are actual rendered panels with a labelled fixture result placeholder.

Published iOS Production OTA on 2026-11-14. Live baseline `bcc470110060cac673f50b8bbacea17508805113`; clean release commit `82ca96b5ce75fd91bbdcef7095ce30a225ae8f8a`; runtime 1.1.20; group `5eb5d75c-64d3-4616-831b-000f61a91b4b`; update `01a1db1e-b1de-7b28-8d07-042ce6d8c154`. Expo update:view and update:list independently confirm the expected commit, platform, runtime and newest iOS Production position. Android remains on its prior release.

Clean-release validation: TypeScript, 66 tests across six suites, lint (0 errors / 227 pre-existing warnings), Mapbox, iOS native/auth/social configuration checks and clean export passed. EAS exported 2,569 modules and reports 112 iOS assets. Native configuration/dependencies match the live iOS base. No native build, store submission or backend changes. Physical iOS adoption and interaction are not verified; component render evidence is described above. Raw scripts, install/check/export/publish logs and EAS readbacks are archived in artifacts/list-filters-20261114/release/.
