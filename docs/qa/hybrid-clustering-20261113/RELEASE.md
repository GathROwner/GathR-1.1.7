# iOS Production release

Published source `526cc4a9d4ba9a2f7d95ff793db0daeeccbd67e8`, retained on `codex/ios-production-hybrid-spacing-20261113`, from live source `32ba9b762c69f8a3239b64c111fcc352fc297f66`.

- Platform: iOS only; channel/branch: production; runtime: 1.1.20.
- Group: `4546ebd9-2b62-4857-8445-8793b2eb20df`.
- Update: `01a1d4df-4eec-7526-b271-f26da2169647`.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/4546ebd9-2b62-4857-8445-8793b2eb20df).

One publication attempt succeeded. Server update:list and update:view independently verified the newest iOS Production update points to the expected source, runtime and update ID. Publication exported 2,566 modules and referenced 112 iOS assets; no new asset uploads. No native configuration, package dependencies, runtime or backend changes. Other platforms/channels were not published.

Clean-release TypeScript, all 79 tests, Expo lint (zero errors, 227 existing warnings), Production Firebase/App Check/social guard, iOS Production configuration, Mapbox preflight and clean export passed. The actual component and real-store clustering renders were independently reviewed before publication. No new post-settle displacement or collision solver shipped.

On-device iOS responsiveness and adoption remain unverified. Fully close/reopen twice, select Hybrid, and check the footer for Production / runtime 1.1.20 / OTA `01a1d4df`. Nearby venues should stay grouped longer as the map zooms out and split through the existing clustering mechanism when zooming in. Photo arcs are thinner and the rotating content uses fixed local bounds. Existing tap handling, summary PNG capture and native map gesture routing remain.

The clean release worktree was removed after raw logs/readbacks were archived. Implementation and protected-main dependency states were compared before/after and remained unchanged. Published source and the reconciled UI branch are retained remotely.
