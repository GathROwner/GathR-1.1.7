# Bluer map wordmark lettering

Craig accepted the 70x26 map wordmark size, then confirmed the earlier requested blue adjustment was still missing. The only runtime change is the lettering fill `#131442` -> `#203B65` in `MapBrandWordmark.tsx`. Preserve the accepted dimensions, vector outlines, red diagonal pin/open circular centre, crimson `#96232B` arcs and header position. No other header/search/map behavior changes.

Live iOS Preview baseline independently verified by list/view before release: source `12b4d814d26270e81c710bdc9f34437733a3308f`, update `01a14aa7-fbed-7090-b9fb-53bbf1ba8b24`, group `80089ff1-583a-4f06-bfd3-9bb06b73dc55`, runtime `1.1.10`. This branch contains that source and its evidence-only follow-up.

`blue-lettering-comparison.png` renders the actual component's vector paths at 70x26 against a pale background, with the preceding navy above for comparison. Independently reviewed colour distinction, retained dimensions, pin silhouette/open circle and red accents. This is an isolated source-artwork render, not a native app screenshot; iPhone adoption and appearance remain separate checks. No map interaction or emulator reconnect was performed.

Validation before publication: TypeScript passes, 4/4 existing FloatingMapSearchHeader lifecycle tests pass, Expo lint 0 errors / 215 existing warnings. Use guarded iOS Preview publication with clean ancestry, auth continuity, both social flags and Mapbox checks. No native dependency/configuration change, Production/Android release, backend deployment or data mutation.
