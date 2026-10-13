# Direct icon family imports

Approved scope: exclude unused icon fonts/supporting modules while preserving every currently available icon and all app functionality. Source baseline `2dc3eaa`; live iOS Preview baseline `6007d550e62a3ab1ed0f3f478c024a606afc6fc2`, runtime `1.1.10`, group `e9fa45b4-4f05-44b2-ae6f-2d51ec722a7c`. This builds on the accepted Upcoming date UI and lossless image compression.

Changed 65 named imports across 53 app/component files to the library's supported family-specific default imports. The installed `@expo/vector-icons` 15.1.1 root entry reexports the same components from the same family modules. No component body, icon family/name/props, glyph map, font file, feature flag, dependency, lockfile, native configuration or runtime changes. The existing direct MaterialIcons import in IconSymbol is unchanged. Six Jest mocks follow the new module paths. See `import-changes.json` for the complete file/binding inventory; the automated transformation asserted that removing import declarations leaves the component bodies unchanged.

Reference: [Expo's direct icon-family import examples](https://docs.expo.dev/guides/icons/). This is an import cleanup in the existing installed library, not a migration to another icon package.

## Preserved resources

`retained-families.json` records SHA-256 hashes and glyph counts for the four used fonts/maps: Ionicons (1,357 names), MaterialIcons (2,234), MaterialCommunityIcons (7,448), FontAwesome (786). Full families are preserved, including dynamically selected category glyphs; no glyph subsetting or native font/resource removal occurs.

`export-before.json` captures the actual previous iOS export: 19 font files / 4,076,840 font bytes, 124 unique assets / 33,355,649 asset bytes, and 6,060,832 bytes of Hermes bytecode. Final measurements and release state will be recorded in RELEASE.md; store download and installed binary savings are not measured by an Expo export.

## Visual evidence

`native-before.png` and `native-after.png` are actual native screenshots of the same temporary isolated icon preview route on s24 / emulator-5554, existing debuggable `com.craigb.gathr` 1.1.10 (13), serving source from this worktree. Four fonts loaded and zero font errors in both; all 32 sampled icons were independently reviewed for shape, alignment, spacing and color. The entire screen below the system status bar is pixel-identical in region `(0, 120, 1080, 2310)`. Preview samples span navigation, calendar/directions, event categories, food/drink, sharing, likes and user controls. Complete resource hashes, rather than a sample, protect the remaining glyphs.

The temporary route was removed before source commit/export. Root startup automatically selected its default map before direct navigation to the isolated preview; no map control/gesture/feature testing or live ad interaction occurred. Staging services and both social flags were used in the Android debug session. Task-owned Metro and emulator were stopped, with no data clear, APK replacement or native build. Android rendering does not establish physical iPhone adoption/rendering.

## Checks and existing failures

Six focused suites passed (20 tests): venue pager, Upcoming date controls, floating header, modal tab touch layer, friend handle card and feed filter summary. The check-in suite separately reports 21 failures / 1 pass. Running the unchanged live release produces precisely the same 21 failure titles and first diagnostic messages (`check-in-baseline.json`), predominantly missing NavigationContainer/useIsFocused setup plus an existing route expectation. No check-in behavior was changed or unrelated test fixture repaired in this optimization. Source/release TypeScript, lint, export/resource verification and release preflights are recorded in RELEASE.md.
