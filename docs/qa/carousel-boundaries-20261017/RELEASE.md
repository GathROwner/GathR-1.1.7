# iOS Preview release

Published 2026-10-17, iOS Preview only, runtime1.1.10.

- Release source: `8e934a1130e817dca2d563e6f13479b42603783f`, branch `codex/carousel-boundaries-20261017`.
- Baseline retained: `5b3912f925efdcb4f769c8c5f1bf0724d5c6ce9e`, previous group `9c307e8f-a5ee-427e-a116-232d2378f2ca`.
- Update group: `b592824e-f83c-443e-ae28-be7eac0f1e73`.
- iOS update: `01a14a02-2e52-7d05-b75d-6241d2ecfe44` (Profile short ID `01a14a02`).
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/b592824e-f83c-443e-ae28-be7eac0f1e73).

The coordinator independently accepted source and native visual evidence before explicitly authorizing publication. Live Preview was rechecked before publication; its latest iOS group remained the accepted baseline and its channel pointed to the Preview branch. Social/auth/Mapbox guards passed in the publishing process with both social flags enabled, Production account continuity and staging native shell. No Android/Production update, native build, backend deploy or Firestore repair.

Validation:21suites /250passed /1existing optional benchmark skipped; TypeScript passes; lint0errors /215existingwarnings; clean Git and ancestry checks pass. All three temporary fixture entrypoints restored byte-for-byte. Only five approved runtime files differ from baseline; all other source, package/native/config/API/cache/auth/social/dock files remain unchanged.

Clean export and actual publication export match byte-for-byte:5,736,316bytes, SHA256 `753ebce6bc77af11a7e6bf7ff0ec3d5e4ed73cfa361070c09dfa6bedfd8223a2`,2505modules,2461source-map sources. Eight route/component/utility sources match checkout. No QA fixture, docs/qa or tests in runtime graph. Metadata has111unchanged image/font assets; EAS reports112iOS assets including launch bundle, with no new assets uploaded. `published-export-check.json` retains exact comparison evidence.

Independent EAS readback confirms exact iOS update ID/platform/runtime/source commit and newest Preview group. The usual advisory about no compatible build fingerprint was emitted for unchanged native fingerprint `9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`; runtime1.1.10 remains the compatibility gate.

Device adoption is not verified. Android screenshots prove shared production components rendered in the existing debug client against synthetic local events and a static map reference. They do not prove iOS adoption, authentication, live map chrome or live-data ordering. On Craig's compatible iOS Preview installation, verify Profile shows `OTA01a14a02`, then check finite two-card rail, looping3+ seam and labelled lightbox boundaries/event count. No map interaction was performed in QA.

The protected9513checkout and previous venue-programme checkout were not edited. Owned Metro stopped, QA app force-stopped, installed app/data preserved. Existing emulator remains running for reuse.
