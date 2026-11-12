# Halo origin and explicit scope explanations

Craig corrected the halo: it must emit from the segmented ring, rather than begin at a separate outer ring. The halo already carries Now/Today timing, so separate green/yellow dots are redundant. He also requested a clearer explanation of cluster-level versus venue-level information.

[Prototype](prototype.html), [origin frame](origin.png), [Now mid-pulse](now.png), [Today mid-pulse](today.png), [selected](selected.png), [expanded](expanded.png), [narrow](narrow.png), [checks](CHECKS.json).

## Halo

The pulse now uses a 56-point SVG at the same coordinates as the segmented-ring SVG, with the same center (28,28), radius 25 and starting stroke width 3. At 0% expansion the transforms are identical. It scales outward and fades to zero. There is no permanent outer circle, border or independent outer starting radius. The colored glow comes from the segmented ring itself.

Green #34A853 means Now; yellow #FBBC05 means Today, matching the owning map's existing getTimeStatusColor mapping. Timing is cluster-level and remains stable while venue photos rotate. The preview timing selector demonstrates both states. Per-venue status dots and selected per-venue time text have been removed; the new-content red dot remains.

The initial display is explicitly labeled 35% mid-pulse to keep the moving effect visible during review without continuously looping motion. Scrubbing to 0% shows its origin; Pulse halo animates once from 0 to 100 in 1.5 seconds, then leaves no outer ring. Rotation does not trigger pulses. Reduced motion disables automatic rotation/pulse; static timing glow and direct frame scrubbing remain available. Expansion hides the pulse because its segmented-ring origin is not present in the fan view.

## Scope explanation

Review annotations sit outside the product marker, so category and scope icons remain compact inside it. The upper summary uses a pale blue background to strengthen grouping.

TOP / cluster totals are fixed while photos rotate: all 4 venues combined, 8 events, 5 specials, 4 Music-category items and 3 friends across the cluster. Category count is a subset, not a count for the displayed venue.

BOTTOM / displayed venue changes with the photo: Hunter's Ale House has 3 events, 1 special and 2 friends in the initial illustrative frame; Gallery Muse has 2 events, 2 specials and 0 friends. The photo, position segment, lower counts and review explanation update from the same active venue. The top friend count remains a cluster total; selected/fanned-out details use venue-specific friend counts.

The annotations explain this proposal, but do not by themselves establish that an untrained app user understands the network/cluster icon. A first-use hint or compact scope labels remain a product design decision. The user requested icon-only marker labels in the preceding iteration; this revision does not silently restore persistent words inside the marker.

## Checks and limits

Browser checks passed for halo/segmented-ring exact origin bounds, no separate status dots or permanent outer ring, Now/Today colors, one-shot pulse completion, unchanged cluster totals, synchronized venue photo/counts/explanations, six-second rotation, fan-out sums, friend scopes, zero values, reduced motion and 320px layout without horizontal overflow. No page errors. Origin, green/yellow and narrow screenshots were independently reviewed.

Counts/friend presence are fictional sample data. Venue photos are displayed from Craig's screenshot through CSS clipping. Accepted production photo sizes stay 36/40/44 points; the example uses a 40-point photo with labeled magnification. This is a browser design prototype, not native Mapbox/collision verification. No app source or OTA changed.
