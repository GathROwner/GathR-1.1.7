# iOS Preview deferred-save movement release — October18,2026

- Runtime source a5caa593d4a8d5a4311b7c8fc11081caf392a60f, branch codex/feed-optimization-20261018.
- iOS Preview only, runtime1.1.10, existing native1.1.10(78).
- Update01a150fc-1c81-7cbb-8926-ef26137e9c8d; Profile short ID01a150fc.
- Group778614a6-37e9-4853-b95e-8fddaf734d96.
- Dashboard: https://expo.dev/accounts/craigb/projects/gathr/updates/778614a6-37e9-4853-b95e-8fddaf734d96 .

Craig adopted prior OTA01a150eb and confirmed flashing persisted; he authorized restoring clipping and deferring saved-first movement. New version immediately updates the star/existing Saved badge, keeps saved-ranking snapshot stable during browsing, and applies the latest saved IDs on return/filter/search/account/hydration boundaries or pull-to-refresh. A changed snapshot starts the list at the top with fresh native measurements. Backend persistence, live Saved-only filtering and ordinary data updates are not delayed. Existing grouping/per-card optimizations remain. Full scope and acceptance sequence: README.md.

Live baseline independently verified as source74892804b4a7167e22aed8219ec813c7474bf233/group7e58fe70-287e-4667-889d-44296cb25ac0 and present in ancestry. Clean-worktree, compatibility, account-continuity auth/Firebase configuration, both social flags and Mapbox guards passed. No native/config/dependency changes. TypeScript passed;5focused suites/32tests passed; full lint0errors/215existing warnings; git diff check passed.

Publisher clear-cache export2511modules/2467source-map sources, including the new hook. Ten critical bundled sources independently match committed files; no QA runtime imports.111image/font asset descriptors/108unique exported assets retain exact baseline bytes. One new app bundle uploaded, no new image/font assets;112final EAS iOS assets. Launch bundle5,748,764bytes,SHA25694643c44138ef8ce1103a5bda07f13aa8474b23d0437992c774fe9e9076a5e01. Fingerprint9ee0b973a2f53ed5647ccafe1599ef64f1580ffb unchanged; same compatible-build advisory as prior Preview.

Independent EAS update:view and update:list confirm exact source, group, update, iOS platform, runtime and newest Preview position. Server publication and local publisher export/source verified; no independent remote launch-byte download claimed.

**Craig accepted the iPhone save-and-return behavior after testing this Preview:** “that fixed it with the exact intended sequence.” The saved post stays in place while browsing and moves to the top after going to Map and returning. Back-to-top and tapping the already-selected tab icon do not apply pending saved ranking; they only scroll. Preserve this accepted distinction. Craig subsequently confirmed both requested phone checks work: saving/browsing/returning in Specials and pull-to-refresh applying saved-first order. The agreed phone acceptance checks for this step are complete. Filter-change behavior additionally has automated coverage.

This is user-reported physical acceptance, not an agent-captured native screenshot/recording or proof of every possible scroll case. Tests execute the actual ranking/filter functions with React test renderer and deterministic fixtures, not UIKit. No agent device/emulator/map testing, backend deploy/data mutation, native paid build, Android/Production OTA or store action performed for this release. This acceptance does not authorize a Production/Android release.

Ignored private evidence: artifacts/feed-save-ranking-20261018/{live-before.json,live-view-before.json,preflight.log,publish.log,export-check.json,published-view.json,published-list.json,tests.json,tests.log,tsc.log,lint.log}.
