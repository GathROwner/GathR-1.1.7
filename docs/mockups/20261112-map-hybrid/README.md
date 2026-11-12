# Current/GathR hybrid marker concepts — November 12, 2026

Craig accepted the 36/40/44-point GathR venue-photo sizing after seeing it on his phone. Preserve that size as the working baseline. Production sizing source d019fa256c494c45d4fa1e3d0c6e79e1cef6d253; iOS OTA 01a1d19a-7697-7db2-b008-57d5b6bec66e. Exact phone footer adoption was not captured here; Craig's screenshot/feedback confirms acceptance of the visible size.

These three preview-only images explore combining Current's lighter basemap/markers and GathR's venue photos. They do not implement or publish a hybrid map style.

- [Familiar stack](familiar-stack.png): lighter category chip, venue photo, event/special rail and explicit venue total. Closest to Current; safest starting point for readability.
- [Segmented ring](segmented-ring.png): venue-position ring plus explicit total, retaining category/content information. Greater visual complexity. The generated image drifted toward dark GathR category cards and does not have reliably exact arc counts.
- [Inline summary](inline-summary.png): photo at left and category/content/venue counts inside a light horizontal capsule. Shorter vertically but wider and more likely to overlap nearby markers.

Built-in image_gen generated one image per concept using Craig's two screenshots as references. [Exact prompts and input roles](PROMPTS.json). These are approximate visual concepts: labels, logo identities, proportions, background details and ring segmentation may drift. They are not app screenshots, live event data or native layout/collision evidence. Review confirmed explicit venue totals and separate event/special counts are present across the examples; the ring's exact semantics should be judged from the deterministic example below.

## Venue-count proposal

Keep an explicit numeric total, such as "4 venues", visible. Use one ring segment per venue to identify the displayed venue; the segment is a position cue, not a substitute for counting. Show "2 of 4" in selection/detail if helpful. Keep event counts, special counts and time status distinct from venue position. Larger venue totals make arcs harder to count, strengthening the need for the numeric total; simplified rings at wider zoom remain a design decision.

[Exact interactive ring fragment](venue-ring-detail.html) and [rendered example](ring-detail.png) show actual segment geometry independently of the generated screenshots. The preview selects total venue counts and changes the displayed venue. Its center is a labeled placeholder for a photo, not a real venue image, and its large diagram dimensions are explanatory rather than production photo sizing.

Browser checks passed for 1/4/8 exact segments, one highlighted segment, next-venue interaction, disabled single-venue navigation, updated totals and a 320px-wide layout without horizontal overflow. The first native click check was affected by the standalone wrapper's initial resize; waiting for the initial layout before interaction resolved it. [Check receipt](ring-checks.json). No runtime page errors. The diagram was independently reviewed at 4 and 8 venues.

No hybrid source changes, Current/Standard marker changes or hybrid OTA publication occurred. User preference between the concepts is pending.
