# Match map wordmark to list-header artwork

Craig accepted the navy/crimson map wordmark in iOS Preview OTA `01a14a9a`, then requested its size match the list headers. This patch changes only the map wordmark SVG dimensions from 108x40 to 70x26 points. Colours, paths, transparent pin hole, header slot/position and search behavior are retained.

Measured source: list headers render `assets/GathR Text Logo.png` in a 105x105 point contain box. PNG dimensions 1536x1024; opaque artwork bounds x242..1255, y268..709. Visible width is `105 * 1014 / 1536 = 69.3164` points. Therefore setting the map logo to the same 105-point box would preserve the size mismatch. The map vector has tightly cropped artwork; 70-point width matches the actual list wordmark without distorting its approved proportions.

`matched-logo-sizes.png` independently reviewed: isolated renders of the existing list PNG at its real contain size and the exact updated map component paths at 70x26, preserving their respective backgrounds. Width, alignment, red pin/open centre and clearance reviewed. This is source-artwork rendering, not a native app screenshot. Native iPhone appearance/adoption remains a separate check; no map was mounted or interacted with.

Live baseline read back before editing: iOS / Preview / runtime1.1.10, source `5a415d518c7b009b016061ff5021f1a4385306ac`, group `a5164736-0184-40a8-83e8-b4a01d2b2f93`, update `01a14a9a-2347-7f2f-bd42-a38878950764`. This branch contains that commit and its evidence-only successor.

Validation: TypeScript passes; all four existing FloatingMapSearchHeader lifecycle tests pass; lint zero errors / 215 existing warnings. Publish with the guarded iOS Preview workflow, preserving runtime, account-continuity environment, both social flags and Mapbox. No native dependency/configuration changes. No Production/Android/backend/data changes are authorized or included.
