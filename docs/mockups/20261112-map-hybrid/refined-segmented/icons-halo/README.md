# Icon labels and visible halo refinement

Craig found the preceding halo invisible and asked to replace Music/category names, the venue wording and Cluster wording with icons. This version keeps numeric counts and the two ownership levels while using a music note/category count, house/venue total, network/group icon for aggregate counts, and house icon for displayed-venue counts. Tooltips and accessible names retain the full meaning.

[Prototype](prototype.html), [collapsed](collapsed.png), [pulse](pulse.png), [selected](selected.png), [expanded](expanded.png), [narrow](narrow.png), [checks](CHECKS.json).

The fixed summary narrows from 150 to 112 points. The medium photo remains 40 points; accepted production photo sizes remain 36/40/44. The blue four-part ring continues to encode venue position.

The halo now has a clearly defined 2-point green outline, glow and light tint, visible at rest. It is a 72-point circle around the marker anchor, outside the 56-point position ring. The photo/venue rail spacing leaves the steady halo visible rather than hiding it behind an opaque count strip. Pulse halo triggers a separate outward ripple lasting 1.5 seconds; the steady ring stays visible. Rotation does not trigger a pulse. When venues fan out, the halo follows the central cluster anchor. This is a proposed attention treatment, not a change to any production status semantics.

Browser checks passed for icon-only category/venue values, rendered scope icons and accessible names, visible halo geometry, independent pulse, synchronized photos/counts, six-second rotation, stable totals, friend scopes/badge clearance, fan-out totals, zero values, reduced motion and 320px layout without overflow. No page errors. Collapsed, pulsing, expanded and narrow screenshots were independently reviewed.

Sample counts and friend activity remain illustrative. The mockup does not verify a busy native map or on-device collision behavior. No app source or production publication changed in this refinement. The full group icon's discoverability remains a design consideration; it is not as familiar as the house/category symbols.
