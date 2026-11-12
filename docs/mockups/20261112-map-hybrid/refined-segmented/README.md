Current design proposal: [small summary ring](small-summary-ring/README.md), retaining the accepted photo ring plus additional summary count ring with corrected icon sizing and interior clearance.

# Refined segmented ring — cluster and venue hierarchy

Craig prefers the segmented-ring direction. He also likes the inline summary, but considers its footprint too large. This refinement is a design prototype, not an implementation or OTA. Preserve the accepted 36/40/44-point venue-photo sizes. This close-up uses a 40-point photo with responsive preview magnification.

## Information ownership

The fixed upper strip belongs to the whole cluster: a representative category count, 4 venues, 8 events, 5 specials, 3 friends, and a new-content indicator. The photo, highlighted ring segment, lower Venue counts, time-status dot and selected venue detail share one active venue. The Cluster/Venue labels make the count scopes explicit. The total venue number stays visible; ring segments are a position cue, not a substitute for a number.

The default friend badge remains with the cluster summary because it is a cluster total. Selection exposes the active venue's friend count. Fan-out puts the actual per-venue friend badge on each venue. The owning app already has both scopes in types/social.ts (ClusterFriendPresence / VenueFriendPresence) and utils/friendPresence.ts (getVenueFriendPresence); actual use must remain viewer-authorized, with cluster friend totals deduplicated across people rather than blindly summed.

Halo attention remains separate from venue rotation. Pulse halo explicitly previews one pulse behind the aggregate area. Rotation does not pulse or imply new content. Reduced motion disables automatic rotation/pulse while manual switching remains available. Selection and expansion pause rotation; hiding the preview also pauses.

## Interaction and alternatives

[Prototype source](prototype.html), [collapsed](collapsed.png), [selected](selected.png), [expanded](expanded.png), [narrow](narrow.png), [browser check receipt](CHECKS.json).

Next/Previous change the photo, ring position and venue counts together. Play rotation advances every six seconds. Fan out venues exposes four separate venue nodes and their individual counts while keeping the cluster totals fixed. Choosing one node returns to that venue's selected state. The expansion is an abstract venue chooser, not a geographic layout; connector positions do not claim real venue coordinates.

Keep the segmented ring as the collapsed/default state. A pie chart would encode shares of content and should not simultaneously mean carousel position. A fan-out can help inspect a small nearby group on demand, but should not remain open across the map. Large clusters should use the existing list/callout or zoom rather than dozens of spokes/segments. The exact threshold, overview/density behavior, native collision policy and expansion/navigation interaction still need a design decision.

## Evidence and limits

Browser checks passed for fixed totals, photo/count synchronization, a real six-second rotation, scope-correct friend counts, exact four-segment position, fan node totals summing to the cluster, visible zero values, no friend-badge overlap with the venue total, independent explicit pulse, reduced motion and 320px layout without horizontal overflow. No page runtime errors. Screenshots were independently reviewed. Screenshots are captured after interaction checks in separate browser pages because Chromium's sandboxed-iframe hit testing became unreliable after element screenshot capture; the normal interaction sequence passed without that capture interference.

Photos are displayed from Craig's supplied screenshot using CSS clipping; no source image was altered. Venue names/logos illustrate the interaction. Counts, friend presence and category mix are fictional sample data, visibly labeled as a sample cluster. This is a deterministic browser prototype, not extracted app components or native Mapbox evidence. It does not verify a busy full-map scene, tap placement, actual authorized friend data or device adoption.

Existing app photo rotation is category/image-option dependent (getVenueLensMediaOptions and activeVenueMediaIndex in app/(tabs)/map.tsx). Implementation of this proposal would need one stable venue ID driving its photo, counts, status and local friend context, using the same filters/time window as the cluster totals. Include image-less venues via a fallback, preserve zero counts, and avoid independently cycling a category label that appears to describe the wrong photo. None of those app changes were made here.

Latest refinement: [icon labels and visible halo](icons-halo/README.md), following Craig's feedback on halo visibility and wording.

Current refinement: [halo origin and explicit hierarchy](halo-origin-hierarchy/README.md), superseding the separate outer halo and timing dots.

Latest comparison: [venue above and cluster summary below](bottom-summary/README.md), preserving the familiar order Craig described.
