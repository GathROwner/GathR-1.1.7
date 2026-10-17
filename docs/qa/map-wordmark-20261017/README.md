# Approved map wordmark — iOS Preview

Scope: replace only the idle map search header's blue-backed white logo with Craig's approved navy wordmark and deep crimson accents. Preserve search, submitted query pill, settings, filters, map and all previous accepted changes.

Live baseline independently read October 17, 2026: iOS Preview runtime `1.1.10`, update `01a14a65-633a-76c8-b64f-02439ee88457`, group `71240bc7-b1b5-4990-a2c2-9a4596162297`, source `d4a058cefe61ea503b785a6cd2cca4d3df14b372`. Working branch contains this source and its later evidence-only commit `dfeb278`.

Implementation: `MapBrandWordmark.tsx` uses existing `react-native-svg` and vector outlines of Craig's approved pasted logo (attachment `088D101C-2A48-4382-9D4D-E292133D78C3/1-Pasted-Image-1.jpg`). Lettering `#131442`; pin and radio arcs `#96232B`. The red diagonal pin overlays the R bowl; its circular counter cuts through both layers. No pale seam around the pin, no background pill or shadow. Native size 108 by 40 points, retained -3 point optical lift within the existing centered header slot. No dependency or native configuration change.

Visual review: `wordmark-detail.png` renders the exact vector paths with transparency. `header-sizes.png` renders the same committed component paths at 320/360/390 point header geometry, with circles representing the existing search/settings bounds. Reviewed pin silhouette/open circle, color consistency, alignment, spacing and clearance. These are isolated SVG renders, not an app screenshot or iOS device verification. The map was not mounted, manipulated or tested; no blocked emulator connection was retried. Craig explicitly requested iOS Preview publication for on-device inspection, under the standing confidence-based release instruction.

Validation before publication: TypeScript passes; existing FloatingMapSearchHeader suite passes all four search lifecycle tests; Expo lint exits zero with 0 errors and 215 existing warnings. Search logic and other header variants are unchanged. Release/auth/social/Mapbox preflight and clean iOS export are required before publication.
