# Feed processing optimizations — iOS Preview

- Runtime source: d540ae98a223ad67053f8f5f8254fd6675416172, branch codex/feed-optimization-20261018.
- Live baseline independently read before publishing:1416f83882fd4c111d590727f954885c8d518e0e, update01a14b4f/group14c93e61-7c95-4601-8316-cd89f9af0b42. Candidate retains that ancestry and accepted Android layout fixes via118fd98, without copying Production version/config changes.
- Published October18,2026 at17:17:56.966UTC, iOS only, branch/channelpreview, runtime1.1.10.
- Update01a15005-2566-7fe9-8bbc-3a1828a0a209; Profile short ID01a15005.
- Group894308bd-16ed-4ae7-a749-e0fb1154dd69.
- Dashboard https://expo.dev/accounts/craigb/projects/gathr/updates/894308bd-16ed-4ae7-a749-e0fb1154dd69 .

Both approved improvements are implemented in shared Events/Specials code. Actual rendered list-builder outputs, ad objects/positions/keys and divider counts match the frozen pre-change callbacks in216 scenarios. New grouping matches480 full-result cases; original paging/filter/timing/check-in tests remain passing. Final selection12suites/94tests; TypeScript passes; full Expo lint0errors/215existing warnings. Initial existing cold check-in timeout and successful unchanged isolated/final reruns are documented in README.md. Ten filter/ranking expressions and both live-count listener effects independently match baseline byte-for-byte after newline normalization. No listener-policy change occurred.

Clean ancestry/auth/social/Mapbox release guards passed. Native config, package/lock, Babel/Metro/EAS config are unchanged from the live Preview baseline. Publisher uses existing iOS Preview account continuity and both Social flags. No native module or paid build required. Existing fingerprint9ee0b973a2f53ed5647ccafe1599ef64f1580ffb is unchanged; EAS emits the same compatible-build advisory as the accepted previous update. Runtime compatibility does not itself establish device adoption.

Local clean-cache export and publisher export both contain2510modules/2466source-map sources. Launch bundle5,747,136bytes,SHA2569fd78ee2d61a2f497ce347fd8158a32c84413eb77e03ace2b271a09b05859d16; publisher's local dist bundle is byte-identical to the checked export. All111image/font asset descriptors (108unique exported files) match the retained accepted export byte-for-byte; no QA sources enter the mobile graph. Final EAS count112iOS assets includes the launch bundle. Exactly one new app bundle uploaded; no new image/font assets uploaded. This is a performance change, not a claimed download-size reduction.

Independent EAS update:view/update:list readbacks confirm exact update/group/source/platform/runtime and newest Preview position. Channel was independently confirmed active and mapped topreview immediately before publication. Server publication and checked uploaded-source export are verified; no independent remote launch-byte download is claimed.

**Actual iPhone adoption and perceived responsiveness remain pending.** Close/reopen Preview twice if necessary, confirm Profile OTA01a15005, then exercise Events/Specials liking two different cards, venue paging and scrolling a longer Upcoming list. The optimization introduces no new visual layout. No map interaction/test, emulator/device operation, Android/Production OTA, store/build action, backend deployment or data mutation occurred for this patch. Existing Production store submissions remain separate.

Post-commit synthetic benchmark is pinned tod540ae9 inbenchmark.json. For400v2records, initial grouping median5.33→1.21ms and three later pagination passes11.95→0.73ms; work counts across all four passes5120→400venue keys and4318→400schedule resolutions. Values differ from earlier audit runs because local desktop timing varies; none is a physical-phone or app-wide speed claim.

Source/release evidence is committed. Do not propose these two optimizations as still unimplemented; preserve them in later additive work and separately record Craig's device feedback.
