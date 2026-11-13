# Published iOS Production correction

- Previous live source: `080c9a0c75f51aef689c86554fd9317055544617`.
- Published source: `32ba9b762c69f8a3239b64c111fcc352fc297f66`, retained on `codex/ios-production-hybrid-summary-20261113`.
- Runtime: `1.1.20`; branch/channel `production`; platform `ios` only.
- Update: `01a1d4be-d604-7d34-960d-e9a27f239e07`; group `6c5fafe6-5396-4fbc-a68c-5a27d5bf4fca`.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/6c5fafe6-5396-4fbc-a68c-5a27d5bf4fca).

One publish attempt completed successfully. EAS update:list and update:view independently confirm the newest iOS Production group points to the exact candidate commit, runtime and update ID. Final publish exported 2,564 modules and referenced 112 iOS assets; no new assets needed upload. No dependency, native configuration or runtime changes. Android and other channels were not published.

The clean candidate passed TypeScript, 26 focused tests, Expo lint (zero errors / 227 pre-existing warnings), Mapbox preflight, Production Firebase/App Check/social environment guard, iOS Production configuration and a clean iOS export. Native PNG outputs and nine actual-component cases were visually reviewed before release. iPhone visual behavior and adoption remain unverified.

To adopt, fully close/reopen GathR twice. The Profile footer should show Production / runtime 1.1.20 / OTA `01a1d4be`. Verify category details, venue totals, static cluster counts during rotation, and pinch/pan starting over a cluster independently on iOS. This is a follow-up verification checklist, not a claim those iOS gestures were device-tested.
