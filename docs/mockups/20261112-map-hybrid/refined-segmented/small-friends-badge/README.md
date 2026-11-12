# Smaller friends checked-in badge

Craig requested a smaller friends indicator relative to the surrounding icons. The cluster badge now has an explicitly rendered 10-point people icon, 9-point count, one-point vertical/three-point horizontal padding and a one-point border. Its measured size is 25 by 15 points, compared with the preceding approximately 39 by 26. Purple remains the friends identifier. It sits just above the summary edge, clear of the counts.

[Prototype](prototype.html), [light](initial-736-light.png), [dark](initial-736-dark.png), [phone width](initial-320-light.png), [next venue](next-venue-736-light.png), [existing fan preview](fanned-736-light.png), [checks](CHECKS.json).

The existing per-venue friend badges in the fan preview use the same smaller icon/count/padding/border scale. Cluster count and scope stay unchanged as photos rotate. The small static cluster ring, rotating photo segment, venue outline and category strip retain their accepted styling. No new tap behavior or fractions were added. Existing exploratory fan/overflow controls remain solely in this browser mockup; this does not implement or authorize changes to app cluster taps.

Checks passed for actual icon/count sizes, 15-point badge height, one-point border, cluster count/accessible scope, consistent per-venue badges, static summary ring during venue change, badge clearance above summary, 320px fit and no runtime errors. Light, dark, phone-width and fan screenshots were independently inspected for hierarchy, alignment, spacing and readability before delivery.

Mockup only; no app source or OTA changed. Sample counts and check-ins remain fictional. Native busy-map rendering and tap behavior are not established by this browser preview.
