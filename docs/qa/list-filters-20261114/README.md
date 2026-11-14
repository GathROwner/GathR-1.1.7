# List filters include events outside the map view

The Events and Specials tabs count their full unfiltered list partitions rather than the map's on-screen events. Categories therefore remain usable when the viewport contains no matching items, and time/date counts describe the same list. Counts include the full candidate pool beyond pagination and respect saved-only selection. Map callers retain viewport-only counts. Candidate arrays are memoized, with independent weak count caches so list and map renders do not evict one another.

Existing category toggle/clear behavior, outside-map section, sorting, grouping, and pagination remain in place. Events time chips now use their content width in the horizontal scroll row, matching Specials, so larger counts do not wrap.

Validation before release: TypeScript and 66 tests across six suites passed. Six actual production filter panels were rendered with fixture data using React Native Web, exact parent JSX/styles, real category/date components and count function. Independently reviewed empty viewport, selected category, Upcoming, Specials, narrow width and 106-result cases. The resulting pills are legible, aligned, and horizontally scrollable without document overflow. This is component-render evidence, not native-device adoption proof.

See VISUAL_RECEIPT.json for fixture counts and renderer limitations; PNGs are actual rendered panels with a labelled fixture result placeholder.
