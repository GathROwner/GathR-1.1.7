# Single-row venue categories

Craig rejected the two-row venue summary and proposed removing its upper totals/house row entirely. Most venues have few categories; show the types present without repeating totals. The photo and matching outline establish venue scope. The earlier three-alternative exploration was superseded by this clarification before delivery.

[Prototype](prototype.html), [typical venue](today-736.png), [phone width](today-320.png), [dark appearance](today-dark.png), [crowded All upcoming](upcoming-736.png), [crowded phone width](upcoming-320.png), [category detail](expanded-736.png), [detail on phone](expanded-320.png), [checks](CHECKS.json).

The top marker has only nonzero category icons and counts, with blue event types and green special types. There is no house icon, totals row or divider in the venue rail. The category strip, photo and both ring highlights update together. The accepted main photo and summary ring sizes remain unchanged. Expanded fan branches also use venue categories.

The mockup includes a proposed overflow treatment: show up to three category pairs, then an ellipsis opening a temporary detail panel listing all types. In the crowded six-type fixture, the three most frequent categories are selected and displayed in stable category-definition order; this prioritization is exploratory, not an accepted production rule. Close, Escape and clicking outside dismiss the panel. Opening details stops rotation. Regular three-type venues show no ellipsis. Category counts are not rotated independently of the venue.

The sample time-window selector changes the fictional Hunter's fixture from three types (3 events, 1 special) to six (13 events, 8 specials). Both venue and cluster totals are recalculated together: 8/5 across the Today cluster, 18/12 across All upcoming. Cluster totals remain fixed during photo rotation within either window. The bottom capsule now uses content-driven width to prevent larger totals touching while preserving the 24-point ring and its 7.5-point house/9-point count.

Browser checks passed for category membership/sums, removal of the venue totals row and house, photo updates, preserved rings, synchronized time-window totals, overflow disclosure, close/Escape/outside dismissal and 320px layout without overflow. Count groups have separate bounding boxes. Typical, crowded and open-detail screenshots were independently reviewed at desktop and phone widths, and the typical dark screenshot was reviewed. No page errors.

Browser mockup only; no app source or OTA changed. Counts and check-ins are fictional; photos use Craig's supplied screenshot. Production work must handle shared active date/filter scope, duplicate event membership across categories, dense native-map collisions, larger counts and callout navigation. The overflow cap/selection and detail interaction are design proposals.
