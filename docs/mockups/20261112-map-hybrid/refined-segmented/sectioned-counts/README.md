# Summary sections with slim dividers

Craig accepted the venue-linked friend/newness indicators and requested distinct count groups inside the larger summaries. His follow-up sketch clarified that simple dividers are sufficient. This proposal uses internal sections within one capsule rather than individually filled nested pills.

[Prototype](prototype.html), [light](initial-736-light.png), [dark](initial-736-dark.png), [phone width](initial-320-light.png), [next venue](next-venue-736-light.png), [no new content](no-new-content-736-light.png), [larger counts/overflow](upcoming-736-light.png), [checks](CHECKS.json).

Each venue category has equal horizontal padding. One-point neutral vertical dividers separate adjacent icon/count groups. The lower summary has dividers after the static venue-count ring and between event and special totals. Its content-driven width still accommodates larger numbers. Icons, numbers, friend badge scale, friend-to-segment links, category red dots, halo behavior and static cluster ring are preserved. The lower capsule is shifted two points to retain clearance for the slightly taller category strip. Existing fan-preview category styling uses the same sections; no new tap handlers were added.

Browser checks passed for transparent section backgrounds, padding and divider geometry, non-overlapping count groups, per-venue friend connectors/clearance, accepted badge scale, category-specific newness, overflow newness, static summary ring, and 320px fit. Light, dark, phone-width and crowded-example renders were independently inspected for hierarchy, alignment, spacing and clipping before delivery. No runtime errors.

Mockup only; no app source or OTA changed. Fictional sample data and native-map limitations from [venue-linked indicators](../venue-linked-indicators/README.md) still apply. This preview does not change or authorize native cluster tap behavior.
