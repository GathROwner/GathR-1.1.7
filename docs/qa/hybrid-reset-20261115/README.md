# Fresh native halo at snapshot handoff

Craig reported that the paired ripple still sometimes appeared fully expanded
on a newly rotated venue, asked for at least 30 percent less separation, and
asked whether large/uncompressed venue images could be involved.

The previous repair coordinated JavaScript timers but kept native halo paint
objects alive across PointAnnotation bitmap refreshes. The new repair gives each
actual bitmap capture a fresh halo presentation ID, initially hidden/collapsed.
The bitmap capture waits two animation frames for layout, then two more frames
before enabling a fresh ripple. These are settling barriers, not a native GPU
completion acknowledgement. A load during that settling period queues another
capture without revealing the halo in between. Pausing/resuming also changes the
halo's presentation key, so it cannot reuse the prior active native layer object.
Tap annotation IDs, source coordinates, hit queries and callout guards are unchanged.

Photo views are keyed by venue/photo identity. Load/error callbacks are scoped
to the committed visible appearance; events from a previous or hidden image
cannot refresh the current venue. This includes returning to the same venue on
a later rotation. No per-frame marker rasterization was added.

The trailing wave now starts at 150 ms rather than 220 ms (31.8 percent sooner).
Its terminal scale is 1.7 rather than 1.6, bringing the visible rings closer while
retaining a smaller following wave. At the preview's 560 ms sample, the radial
separation decreases by about 33 percent under the bridge's linear interpolation.
That spatial percentage is not claimed for every phase or native easing curve.
The accepted darker colors and larger leading wave remain.

Read-only public feed/image sample: 100 events on the first page exposed 38
distinct profile-photo URLs. Twelve were inspected; all twelve are compressed
WebP. Four sampled images have a dimension of 2000-2048 pixels, despite a roughly
36-point marker. Downloads ranged from 524 to 342932 bytes. This is evidence of
oversized source dimensions, not proof of full-resolution decoding, uncompressed
files or the cause of the phone hitch. React Native's installed iOS image loader
passes view bounds and screen scale to its image loader. Estimated RGBA sizes in
IMAGE_SAMPLE.json are theoretical full-size buffers, not measured allocations.
No stored photos or server data were changed.

New regressions exercise a late current-photo load during an outward ripple,
fresh hidden native IDs/base radii before capture, recapture during settling,
stale previous-photo callbacks and unmount cancellation. The fresh-ID test was
also run against the untouched live d6c11f9 source and failed at the expected
retained-ID assertion. The temporary test fixture was restored exactly and that
checkout verified clean before release assembly.

Actual RN markers and actual accepted/candidate native circle props were rendered
through an SVG bridge on light/dark surfaces and independently reviewed. Palette,
two-ring distinction, spacing and surrounding marker layout were checked. The
animated preview remains in ignored artifacts. Native iPhone playback and the
reported visual interruption are not independently reproduced/verified.
