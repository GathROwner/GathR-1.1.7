# Photo ring plus summary count ring

Craig clarified that the segmented house/count indicator in the cluster summary is additional to the segmented ring around the venue photo. The preceding single-ring mockup misinterpreted that request. This revision restores the photo ring and retains the smaller summary ring.

[Prototype](prototype.html), [Now halo](now.png), [second venue](selected.png), [Today halo](today.png), [halo origin](origin.png), [expanded](expanded.png), [narrow](narrow.png), [checks](CHECKS.json).

The displayed photo, upper venue counts, upper outline and highlighted segment in both rings update together. The lower house/count ring contains the total venue count (4), followed by fixed cluster event (8) and special (5) totals. The cluster friend badge (3) stays attached to the lower summary. Category row, split/network icon and separate timing dots remain removed.

The main photo is still 40 points; the accepted app photo sizes remain 36/40/44 points. Preview magnification is labeled. Venue accents are blue, purple, rose and cyan, independent of the green Now and yellow Today timing halo. A single halo originates at the photo ring while collapsed; when fanned out, it originates at the summary ring. It expands from the same geometry rather than a separate permanent outer ring.

Browser checks passed for both rings, matching highlights and outline across venues, fixed cluster totals, summary-ring house/count containment, halo origins and timing colors, expansion, six-second rotation, per-venue sums, zero counts, reduced motion and 320px layout without overflow. No page errors. Rendered Now, selected-venue, narrow and expanded screenshots were independently reviewed for hierarchy, alignment, spacing and clipping.

Counts and friend activity are fictional sample data. Venue images are displayed through CSS clipping of Craig's supplied screenshot. This is a browser-only design preview: no app source or OTA changed. Native busy-map collisions and final navigation behavior remain unverified. A real implementation must preserve stable venue identity and accents across filtering, and retain non-color identity cues for accessibility and larger clusters.
