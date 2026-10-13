# Lossless bundled image compression

Approved scope: lossless compression of the 12 large category fallback images and the header logo. Baseline source `b70f761`; live iOS Preview baseline `ad2c568d6b147707970288dd41ed6394ec14e245`, runtime `1.1.10`, group `93cc0b35-e52d-4b75-a3c2-f0b8ae7cc7a9`.

Only PNG IDAT (compressed pixel stream) chunks change. Original file paths, PNG encoding, IHDR dimensions/bit depth/color type, ancillary metadata, transparency and decoded pixels remain identical. The fallback filenames retain their existing `.webp` extensions even though their contents were and remain PNG: this deliberately avoids changing native decoding requirements or application references. No resizing, quantization, lossy encoding, native dependency/configuration, app behavior or backend changes. Icon font optimization is deferred.

## Measurements

| Scope | Before | After | Saved |
| --- | ---: | ---: | ---: |
| 12 category fallbacks | 23,541,267 bytes | 21,233,025 bytes | 2,308,242 bytes |
| Header logo | 2,082,930 bytes | 1,911,510 bytes | 171,420 bytes |
| Total reviewed images | 25,624,197 bytes | 23,144,535 bytes | 2,479,662 bytes (9.677%) |

`compression.json` records original/optimized SHA-256 hashes, decoded pixel hashes, dimensions and per-file savings. Pillow independently asserts exact pixel and metadata equality before each write; `node scripts/verify-bundled-pngs.cjs b70f761` separately decodes originals from Git and optimized files using pngjs, validates CRCs and compares dimensions, RGBA pixels and all non-IDAT chunks. No app dependency was added. The Python maintenance helper requires Pillow in the developer environment.

`export-before.json` records the existing iOS export at the live commit: 124 unique assets, 35,835,311 asset bytes, Hermes bundle 6,060,948 bytes. This is uncompressed exported payload, not measured App Store download size or device storage. The next native build can incorporate the smaller images. An OTA cannot remove assets embedded in an existing binary and initially downloads replacements.

## Visual validation

`native-original.png` and `native-optimized.png` are actual screenshots from the existing Android s24 debug client (`com.craigb.gathr`, version/runtime 1.1.10, versionCode 13), running Metro from the source checkout. Both show all 13 assets loaded and zero errors. I independently reviewed every image, text within the artwork, framing and logo transparency against the blue background: no visible difference. The screenshot grid below the test header is also compared pixel-for-pixel; see the release notes for the exact region/result.

A temporary component-only asset preview route rendered Git-original copies and optimized files with React Native Image. It was removed before committing/exporting. Original copies are ignored under `artifacts/asset-originals` and are not referenced by released code. Initial emulator startup and Metro connection attempts timed out; after boot completed, the debug package probe passed, the bundle was prewarmed, and the source was visibly adopted. No app data was cleared or binary replaced. Root startup briefly selected its default map automatically before navigating directly to the isolated preview route; no map controls, gestures or map-feature tests occurred. No live-ad interaction occurred. Android evidence does not prove physical iPhone rendering/adoption.

Source TypeScript passed; focused gallery tests passed (1 suite / 5 tests); Expo lint passed (zero errors / 215 existing warnings). Independent pngjs verification passed for all 13 files. Final release export, preflights and EAS readback are recorded in RELEASE.md.
