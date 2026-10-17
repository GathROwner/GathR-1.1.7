# Lighter map wordmark blue

Craig requested lettering almost as light as the Events header, but slightly darker. Header source `SlidingFeedHeader.tsx` uses `#1E90FF`. Change only the map wordmark lettering from `#203B65` to `#2585E6` (RGB37,133,230), retaining 70x26 dimensions, vector paths, crimson `#96232B`, transparent pin circle and position. No search/header/map behavior or other UI colours change.

Live iOS Preview baseline independently read by EAS list/view: source `c5923ddbbac77f3ea014a84a805214b99b1c0107`, update `01a14ab7-2853-7fb7-85f8-896ade5ec033`, group `63a8c1a5-81c0-4c88-b114-20ad2a9976c9`, runtime1.1.10. This branch contains that source and its evidence-only successor.

`light-blue-comparison.png` renders actual component paths at the accepted native size, alongside preceding navy and the Events-header reference colour. Independently reviewed the lighter-blue relationship, retained pin/open centre, dimensions and red accents. This is isolated artwork rendering, not native app verification. No map interaction or emulator reconnect occurred. iPhone adoption/appearance remain separate checks under standing confidence-based iOS Preview release authority.

TypeScript and all four existing FloatingMapSearchHeader lifecycle tests pass. Lint0errors /215existing warnings. Guarded iOS Preview publisher must preserve runtime, clean ancestry, account continuity, both social flags and Mapbox. No native dependency/configuration changes or Production/Android/backend/data changes.
