# Initial auth settlement before the shared feed fetch

## Phone evidence

Craig's first-load trace after the durable snapshot OTA starts at
`2026-11-16T10:33:57.679Z`, run `map-mwj4lsq7`:

- Actual source fetch began at 117.0 ms; private fetch skipped with no account.
- React auth-ready milestone arrived at 282.6 ms.
- Nine public pages supplied 848 events; public normalization ended 3091.1 ms.
- Merge began and immediately recorded `feed_fetch_failed` at 3124.1 ms.
  At that code position the account-change guard is the failure path.
- Successful refresh/clusters arrived at 6523.8 ms; map frame proxy 6668.6 ms.

The durable public writer receives the initial complete public fetch before the
private merge; this log does not prove its disk write committed. The absence of a durable cache-ready milestone on
this first adoption is not evidence of a failed write: no copy was available at
startup, and the reader is not a live subscription to later writes.

## Matching read-only server evidence

Cloud Run logs in `gathr-migrated` contain two sequential matching nine-page
public feed request chains in the exact window, all HTTP 200. First pages:

- `10:33:57.916557Z`, latency 0.226288032 s.
- `10:34:01.834448Z`, latency 0.239644012 s.

There are 18 matching requests total, including the same cursor sequence in
both chains. These are request-window correlations, not per-device request IDs.
Together with the phone's account guard failure and later successful refresh,
they support a redundant initial download/retry, not server cold-start delay.
Sanitized timestamps/status/latency/page-order receipts omit URLs and cursors.

## Cause and repair

The root startup hook waits for React auth readiness, but the root AppState
foreground listener and map/store producers can call the same feed fetch before
that hook's gate opens. The durable-snapshot release added an important account
guard; the early guest download then failed that guard during restored sign-in.
The existing query retry fetched the public feed again.

`fetchMinimalEvents` now waits for the installed Firebase Auth SDK's public
`authStateReady()` promise at the shared API entry point. The actual source
account and source in-flight key are captured only after initial state settles.
Concurrent callers share the readiness wait and the subsequent account-aware
source request, including callers arriving immediately after restored sign-in.

A settled signed-out session still works. A real account switch after a source
download starts still rejects that old result. No account identifiers were
added to logs. The no-method fallback preserves existing mock/compatibility
callers; installed production Firebase Auth exposes `authStateReady()` in its
public Auth declaration and `initializeAuth` supplies the Auth instance.

## Verification

The new startup-ordering regression was run first against unchanged source and
failed because network/private I/O began before readiness. With the repair it
verifies no pre-auth source I/O, one full source download across auth settlement,
one private lookup for the settled account and correctly tagged results for all
callers. Additional tests retain settled guest access and rejection of a real
later account switch. Focused run: 36 passed across four suites.

Full release regression, TypeScript, lint, Mapbox, auth/social/environment and
live-source ancestry checks are required before publishing. Durable snapshot,
private merge, date filtering, account clearing, map paints, ripple timing and
tap delivery are unchanged. This has no native dependency, backend deployment
or paid cloud-capacity change. Native after-fix speed/adoption are not claimed
from tests or EAS metadata; later phone observation remains necessary.

## Guest requirement and publication

Craig explicitly required guests to keep working without signing in. The actual
`app/index.tsx` Continue as Guest handler was read: it routes to the map without
Firebase sign-in. Map guest classification remains `!user`. The new gate accepts
a settled null account; it does not wait for a future user login. Existing guest
limits, guest UI and private-access rules were not changed. This is source/API
test evidence, not a native guest-UI interaction claim.

- Implementation `1cb057f`; clean release `44d6d542b67008844a9580cc30fa6d81f936c5b5`.
- iOS Production runtime `1.1.20`, group `4adc8241-b31d-4e93-a142-236a4e750448`.
- Update `01a1e3f7-7972-7c6d-bbd1-3ba6ad820c70` (`OTA 01a1e3f7`).
- EAS view and newest-iOS list independently match runtime, platform, source,
  group and update. Export: 2581 modules, 112 final iOS assets.
- Release validation: 38 suites, 294 passed, two existing skips; TypeScript
  passed, lint zero errors/224 existing warnings; Mapbox, production Firebase,
  App Check, social flags, clean worktree and live ancestry checks passed.
- Durable snapshot, auth clearing, private merge and map paint/tap files are
  unchanged from the prior live source. No cloud settings/backend changes or
  native builds. Other platforms/channels were not published.
- New phone adoption and startup speed remain unverified.

Machine-readable receipts: `CONTRACT.json`, `SERVER_REQUESTS.json`,
`CHECKS_PASSED.json` and `PUBLISHED_IOS.json`.
