# Clean iOS Preview candidate; publication held

No OTA published. Existing live Preview remains iOS `01a14a02-2e52-7d05-b75d-6241d2ecfe44`, group `b592824e-f83c-443e-ae28-be7eac0f1e73`, source `8e934a1130e817dca2d563e6f13479b42603783f`, runtime1.1.10. Fresh EAS list/view were checked before export.

Functional fix `43e826f2985078df1f06be6c3413168997fd98b3`; tested/exported clean candidate `089ad6b50122e3010c3f515d1c2365a3440c148a`. Later evidence-only commits retain that exact runtime source tree. Checkout `C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54`, branch `codex/carousel-boundaries-20261017`.

Only runtime delta:4lines on GlobalEventLightbox in app/(tabs)/map.tsx pass loopNavigation=true for exact Trending manual/auto sources. This repairs a pre-existing inconsistent caller contract; it is not proven to explain a category-carousels-only user failure. Existing category controls/design, finite2rail, dots, counter, arrow labels/alignment, gallery and all gesture code are byte-identical to live source. Other global/callout callers remain bounded.

Expanded clean gates:23suites /269passed /1existing optional benchmark skipped; TypeScript passes; lint0errors /215existingwarnings; diff check passes. Guarded iOSPreview auth/social/Mapbox/ancestry/clean-worktree preflight passes with **Publish=False**. Original root/index restored byte-for-byte; map equals intended candidate snapshot; both QA runtime modules removed.

Clean iOS-only Hermes export:

-5,736,344bytes; delta+28bytes from live-reviewed bundle.
-SHA256 `5409d9e43b3479454e3e03e6d75579c98151bde6d2a04da81d303974dd758f70`.
-2505modules /2461source-map sources, identical source graph to live-reviewed export.
-111assets, metadata byte-identical to baseline; no added or altered asset.
-All2460other source contents equal to baseline; only /app/(tabs)/map.tsx differs, verified as exactly the four-line prop insertion.
-Eight route/component/utility source-map contents match checkout hashes. No fixture/QA/test runtime sources.

Full machine-readable proof:export-check.json. Local logs/export:artifacts/carousel-loop-regression-20261017/{release-tests.log,release-typecheck.log,release-lint.log,release-preflight.log,release-export.log,export/}. No dependency/native/config/backend/data changes, map interaction, APK replacement or app data clear.

Visual limitation:before-fix actual Trending host captured; **no post-fix native boundary screenshot**. Emulator qemu crashed twice; connection and manifest-read commands were rejected twice by automatic approval review, including once after Craig explicitly approved connection. Read-only screencap remains permitted but showed Android launcher with System UI ANR, no loaded GathR client. No retry/workaround after the second rejection. Metro stopped. Exact commands and evidence:REJECTION.md.

**Hold publication.** Coordinator must independently review source/export and obtain one explicit decision from Craig about the missing visual acceptance plus iOSPreview publication. Recheck live baseline and guarded release conditions immediately before any later authorized publish. This preparation provides no Android/Production release authority or iOS device-adoption evidence.
