# Slow startup: retained feed and backend cold instance

## Physical iPhone evidence supplied by Craig

Both shared exports have diagnostic module timestamp `2026-11-16T02:02:33.651Z`
and run `map-mwimc4s3`: they are two exports of one completed startup, not two
independent samples. No saved bootstrap feed was found after restoration.

| Stage | Milliseconds since diagnostic module load |
| --- | ---: |
| Auth ready / no saved feed | 942.5 |
| Public page 1 started | 942.8 |
| Map loaded | 1308.8 |
| Private fetch finished (0 items) | 1680.9 |
| Public page 1 received (100 items) | 7125.0 |
| Public page 8 received (91 items) | 9825.6 |
| Full feed finished (791 items) | 9890.7 |
| Clusters computed / viewport published | 9934.1 |
| Map frame proxy with clusters | 10155.3 |

The public request path took 8947.6 ms. The first page took 6182.2 ms; the
remaining seven serial pages took 2700.6 ms. Feed completion to clusters took
43.4 ms. These are JS milestones, not total native launch or pixel visibility.

## Independently read backend evidence

Cloud Run service `gathr-backend`, project `gathr-migrated`, Montreal region,
revision `gathr-backend-00088-m9k`:

- First public-page request at `2026-11-16T02:02:34.984683Z`: HTTP 200,
  server request latency `5.382640s`.
- New instance started at `02:02:35.010238Z`, reason `AUTOSCALING`.
- Startup TCP probe passed at `02:02:39.160334Z`.
- Seven matching subsequent cursor requests from `02:02:40.801556Z` to
  `02:02:43.271365Z` each returned HTTP 200, server latency 0.148–0.393s.
- Service/revision minimum instance count unset (effective zero), startup CPU
  boost already enabled, 1 vCPU / 1 GiB memory, concurrency 80, max 20 instances,
  100% latest-revision traffic.

This directly supports backend startup as most of the first-request wait. It
does not assign all client latency to the server. We did not stop or restart
the service, invoke refresh/mutation endpoints, or change cloud configuration.

Two bounded public API GETs with requested limits 100 and 500 both returned 100
items, identical 512683-byte bodies and a next-page token. Increasing the app
page size alone cannot reduce these eight requests. No backend pagination or
filter contract was changed; public and private results still join before
publication, so partial pages cannot incorrectly become an authoritative feed.

## Reproduced cache eviction and fix

The full-feed query has no permanent query observer. Its old ten-minute GC
removes it from the query cache. TanStack persists the removal, overwriting the
disk snapshot without the feed despite the existing twelve-hour disk max age.
The new test reproduces that sequence using real QueryClient persistence and
chunked AsyncStorage, with a later unrelated query update before restoration.
This is a proven available failure path, not proof it was the only reason
Craig's phone had no saved feed. Expiry, auth clearing or unavailable storage
can also cause a legitimate miss.

- Retain only the current full-feed query for the existing twelve-hour window.
- Register the query default before hydration (auth need not have finished).
- Apply the same retention to root and store full-feed fetch paths.
- Keep three-minute freshness, ten-minute detail-query GC, twelve-hour disk
  snapshot expiry, auth handling, private-event composition and current event
  expiry/filtering unchanged.
- No cache-key migration, new storage format, dependency or native change.
- Hybrid annotation, ripple helper, marker, tap handler and style files are
  byte-identical to the accepted smooth-ripple implementation.

## Validation and limits

Source checks: 35 suites, 269 tests passed; two pre-existing skips (opt-in
detail benchmark and the documented stale cache-key assertion). TypeScript
passed. Lint: zero errors, 225 existing warnings. Four new retention tests cover
old-versus-fixed eviction, stale refresh including authoritative empty results,
pre-auth restoration retention and the existing twelve-hour snapshot expiry.

The new regression is also run against the unchanged live iOS source in the
owned release checkout, with the temporary test removed afterward. Receipts
are retained under ignored `artifacts/startup-retention-20261115/`.

No new native map manipulation or rendered layout claim is involved. These
changes do not alter layout or paint; native slow-start improvement and OTA
adoption require later user observation. The fix prevents premature cache loss;
it cannot make an empty/expired-cache first download instantaneous.

## Optional backend configuration, awaiting cost decision

Proposed service-level change only:

```powershell
gcloud run services update gathr-backend --project=gathr-migrated --region=northamerica-northeast1 --min=1
```

Rollback to the currently unset service minimum:

```powershell
gcloud run services update gathr-backend --project=gathr-migrated --region=northamerica-northeast1 --min=default
```

Keep the current image, revision traffic, CPU/memory, billing mode, max scale,
environment and secrets. Re-read these properties immediately before and after
any authorized apply. Service minimum instances reduce idle-to-first-request
startup; instance replacement and scale-out can still start new instances.

Official Montreal request-based pricing embedded in
https://cloud.google.com/run/pricing is USD 0.0000035/vCPU-second idle and
USD 0.0000035/GiB-second idle. At current 1 vCPU / 1 GiB, 730 hours entirely idle
models USD 18.396/month before free tier, credits, tax and currency conversion.
Normal active request costs remain; this is an idle-capacity model, not an
account invoice forecast. Official setting reference:
https://docs.cloud.google.com/run/docs/configuring/min-instances
