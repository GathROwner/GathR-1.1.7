# iOS Preview clipping comparison published October18,2026

- Source74892804b4a7167e22aed8219ec813c7474bf233, branch codex/feed-optimization-20261018.
- Platformios, channel/branchpreview, runtime1.1.10; retains existing iOS Preview native1.1.10(78).
- Update01a150eb-1f1f-7718-9475-b0ab06c85c54, Profile short ID01a150eb.
- Group7e58fe70-287e-4667-889d-44296cb25ac0.
- Dashboard: https://expo.dev/accounts/craigb/projects/gathr/updates/7e58fe70-287e-4667-889d-44296cb25ac0 .
- Previous iOS Preview update01a15005-2566-7fe9-8bbc-3a1828a0a209/group894308bd-16ed-4ae7-a749-e0fb1154dd69/source d540ae98a223ad67053f8f5f8254fd6675416172 independently read before publication and present in candidate ancestry.

Exactly two runtime changes: native offscreen clipping disabled on iOS Events and Specials; Android retains true. No current save-ranking change, duplicate Saved section or delayed promotion implemented. Both prior optimizations retained. Craig liked immediate Saved feedback with promotion deferred until returning/refreshing as separate next UX work, after this isolated comparison.

Validation: TypeScript,4focused suites/20tests, full lint0errors/215existing warnings, git diff check. Clean-worktree and source-ancestry guards passed. iOS Preview account-continuity auth/Firebase config, both Social flags and Mapbox preflights passed through the guarded publisher. Native/config/dependency trees unchanged from live baseline.

Publisher clear-cache export2510modules,2466source-map sources. Independently compared nine critical bundled sources to the committed files, including both updated feed screens, grouping/per-card hook and accepted lightbox/inset/scale sources; no QA sources bundled. All111image/font descriptors/108unique exported assets retain exact baseline bytes. One app bundle uploaded;112final EAS iOS assets. Launch bundle5,747,136bytes SHA25687839b289f844fa33d38ddd8df504e96e505f6969d48a8e36b99172dc9a617ee. Fingerprint9ee0b973a2f53ed5647ccafe1599ef64f1580ffb unchanged, with the same compatible-build advisory as previous Preview.

Independent update:view and update:list require and confirm exact update, group, source, iOS platform, runtime1.1.10 and newest Preview position. Publication/source/export verified; no independent remote launch-bundle download claimed.

**Craig confirmed phone adoption of OTA01a150eb and reported flashing still occurring.** This experiment did not resolve the symptom. He approved restoring clipping and testing deferred saved-first movement; see ../feed-save-ranking-20261018/README.md. No new device/emulator operation, map test, Android/Production OTA, paid build, backend deployment or data write in this release. Earlier emulator attempt remains inconclusive and predates this patch.

Private ignored evidence: artifacts/feed-jitter-20261018/{preflight.log,publish.log,export-check.json,published-view.json,published-list.json,tests.json,tests.log,tsc.log,lint.log}. Restore the prior clipping setting only as a separately recorded comparison if this experiment is inconclusive or regresses responsiveness.
