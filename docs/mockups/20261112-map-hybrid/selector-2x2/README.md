# Temporary Hybrid selector in a 2 × 2 grid

Craig agreed to trial the new markers inside GathR as a temporary fourth map option, Hybrid · Beta, using Current's map background and preserving the existing Current, Standard and GathR options. He specifically requested a 2 × 2 selector mockup because space may be insufficient. Current should remain the app default. This mockup selects Hybrid only for reviewing its placement.

[Prototype](prototype.html), [full screen](top-736.png), [legend scrolled](scrolled-736.png), [scaled phone preview](top-320.png), [scrolled phone preview](scrolled-320.png), [checks](CHECKS.json).

The supplied 590 × 1280 screenshot is embedded unchanged as a placement reference. A DOM map panel overlays its existing panel at approximately 210 points wide, top 150, and height 518, using the screenshot's 1.5-pixels-per-point scale. The replacement has Current/Standard on row one and GathR/Hybrid Beta on row two, with 44-point-high choices. Existing source panel colors, labels and spacing informed the recreation. The old map markers in the reference image are not a rendering of the new Hybrid design.

Width is sufficient, but adding a second selector row consumes the space available for the full legend. The proposed solution pins the panel heading and selector, and scrolls only the reference legend below them inside the same panel footprint. The reference legend content is about 416 points high, with about 306 points available. A scrollbar and fading More legend cue indicate additional content. At the bottom, every indicator including You are here is reachable while the selector remains visible.

The rendered panel ends near point 668, approximately 11 points above the reference readiness button's top and 108 points above the bottom tabs. Those are screenshot-placement measurements, not independently verified native layout bounds. The 320px captures scale the same screenshot/layout for display; they do not establish fit on a native 320-point device. Native implementation needs available-height constraints based on safe areas and actual control positions.

Browser checks passed for loaded reference dimensions, four choices in two rows/two columns, 44-point button height, selection labels, GathR lighting controls, fixed selector position while the legend scrolls, reachability of all legend rows, panel bounds/clearance and no horizontal overflow. Top, scrolled and phone-preview screenshots were independently reviewed for hierarchy, alignment, spacing, clipping and control visibility. No runtime errors.

No app source or OTA changed; Hybrid is not enabled yet. Existing cluster taps/callouts/filters remain outside this selector mockup's scope. Native implementation must map Hybrid explicitly to Current's style URL plus the new marker renderer rather than allowing the existing non-Current Standard-style fallback to select its basemap accidentally.
