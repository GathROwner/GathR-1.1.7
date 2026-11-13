# Hybrid summary capture correction — November 13, 2026

Craig reported persistent empty venue and cluster pills on iOS Production update `01a1d2c1` (group `504afe48-6b46-4947-8025-8b0fe0c46e6c`, source `080c9a0c75f51aef689c86554fd9317055544617`). Photos, large SVG rings and pill backgrounds remained visible, while nested counts, icons and dividers disappeared. This is consistent with offscreen subview capture, rather than missing event data. The installed RNMapbox iOS PointAnnotation implementation uses `view.layer.render(in:)` on a detached React subtree.

## Repair

Snapshot-mode summaries now use complete SVG graphics, with MaterialIcons outlines from the existing bundled font and numeric SVG text. The installed native SVG exporter explicitly draws them into a PNG (`toDataURL` calls `drawRect` under a UIGraphicsImageRenderer on iOS). A real Image loads the complete PNG; its decode callback schedules Mapbox refresh. All summary content is already pixels when PointAnnotation takes its bitmap. This avoids reliance on detached RCTText or individual nested border views. Exports are cached with a 128-entry bound; stale venue exports cannot replace newer contents. Friends badges, fallback initials and compact counts use the same path. Other map presentations keep their current rendering.

Native PointAnnotation selection, original callout handlers, native noninteractive halo, three-second rotation, all-zoom detail, 90% sizes, close spacing and ring-to-photo contact remain. No native dependencies/config, runtime or other release targets changed.

## Visual acceptance

Independently reviewed [nine actual-component cases](actual-markers.png), rendered through RNWeb using the snapshot graphics and iOS dimensions. Category counts, section dividers, static ring/house/count, overflow and friend placement fit their bounds. The [native fixture](native-fixture.png) shows actual HybridSummaryImage decoding plus a native PointAnnotation. Its map is washed out by the existing emulator GPU issue, so color/polish acceptance uses the clear standalone native PNG exports and actual-component render.

Reviewed actual native renderer output: [venue categories](native-venue.png), [cluster totals](native-cluster.png), [large counts](native-large.png), [friends badge](native-friends.png). All detail is present in the PNG itself. The native fixture uses deterministic data and the existing debug client, without app navigation, Firebase fetches, ads, reinstall or data clearing. Its temporary package entry was restored byte for byte, its files removed from the device, and Metro/emulator stopped.

No iPhone is connected. Native iOS bitmap appearance, iOS pinch behavior and device adoption remain unverified; Android native export and source inspection are supporting evidence, not an iOS screenshot. See [native checks](NATIVE_CHECKS.json) and [geometry checks](VISUAL_CHECKS.json).

## Validation

26 focused tests pass: graphic contents and totals, explicit PNG export/decode refresh, stale export rejection, rotation synchronization, fixed cluster totals, native tap routing, anchor/halo geometry and measurement. TypeScript passes. Expo lint exits zero (227 existing warnings, zero errors). Clean release export and production configuration checks are recorded with the release receipt.
