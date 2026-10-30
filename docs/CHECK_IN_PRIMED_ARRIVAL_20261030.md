# Primed check-in implementation

Local candidate only. The existing Production checkout and releases were preserved; this branch starts at `e3df86bf7faf0f7bc0791ac0bd5491a7a3329c68`. No OTA, push, production data change or real check-in is part of this work.

## User-visible contract

The existing purple Here and blue Place rings keep their stationary-time meaning: 30 seconds for private Here, 90 seconds for public Place. Verification and nearby-place preparation run during that time. A full ring means server-qualified evidence is usable. Public completion additionally requires prepared canonical and external lists; successful empty results are valid, an outage is an explicit failure. The control uses the prepared list in the same render as its ready cue, not an after-render load.

Tapping ready uses the prepared choices immediately. Opening Somewhere else displays prepared non-GathR suggestions rather than starting a second search. The first public screen remains the existing GathR list; optional top external suggestions on that first screen remain deferred. When one provider/path fails, independently usable options remain available without pretending the whole public flow is ready.

## Arrival and safety

The existing readiness session now carries optional server-qualified arrival evidence for three minutes. The picker captures that bounded snapshot; it does not override OS GPS. Form selections survive ordinary receipt loss, GPS jitter and short app switches. Final confirmation binds the chosen target from the server's stored qualified area, then uses the existing five-minute one-use target grant and idempotent create operation. No new parallel eligibility system or automatic friend-visible check-in was added.

The 30/90-second dwell, prequalification 0.7 m/s stationary threshold, 20 m anchor and 5 m/s vehicle threshold remain. Accuracy 26–50 m pauses Place and worse accuracy pauses both, without crediting uncertain endpoints; retention is bounded by last qualifying timestamps. A qualified arrival survives a noisy fix but is revoked by accurate departure or corroborated vehicle movement. Backend rules are authoritative. Permission/basic-mode/sign-out changes revoke local attempts. No background readiness tracking was added.

Bound grants remain authoritative if an ordinary receipt/arrival expires while a binding request returns. Explicit owner/permission/departure revocation still rejects late responses. Failed-create retries reuse grant and operation IDs. Foreground grant expiry restarts preparation without erasing audience, duration or message.

## Preparation and request budget

One combined discovery call starts during the countdown once a suitable stationary baseline exists and supplies both canonical and external preparation. A standalone canonical fallback is used only when the OSM request allowance is exhausted. The 175 m preparation pool is filtered to the qualified arrival radius and public footprint before presenting usable candidates. An explicit preparation capability marker and combined-result status are required, so an older or incomplete backend response cannot produce a false ready state.

Prepared results are owner/session/location scoped, deduplicated and cached in memory for at most five minutes, bounded by candidate expiry. Nearby pending work can be reused across a session replacement or brief app switch; stale owner/session results are ignored. Failure retention is separate from candidate expiry, so staying in the same accuracy-aware area cannot trigger automatic retries at a timer boundary. Explicit retries have backoff. The local external budget allows 16 automatic preparations with four reserved manual attempts within the existing 20/day server allowance. The server remains the final budget enforcement across process restarts/devices. Explicit browse retries may use an original fix up to the lookup API's existing 60-second freshness bound; automatic warming still uses 15 seconds, and no capture timestamp is refreshed or credited as dwell.

Readiness requests have an actual-send floor of ten seconds during qualification and thirty seconds after qualification. Aged-but-valid GPS timestamps cannot create a two-second server loop. Existing 360/hour readiness and 20/day discovery limits remain unchanged. Only preference metadata is persisted; precise evidence, prepared candidate locations and grants remain in memory.

## Validation and release boundary

The coordinator's `CHECKIN_IMPLEMENTATION_RESULT_20261030_V2.md` records final exact test counts and evidence. Focused tests cover reducer/contract, observer lifecycle, budgets/cache/failures, both screens, transport cancellation, explicit permission-mode revocation, target binding, private sharing and idempotent server transactions. Component render fixtures use actual JSX/styles with native maps/icons omitted. They are not native device QA.

Backend must be reconciled against exact serving function source before release, then published and verified before this frontend. Required functions: record readiness, bind readiness, private candidate creation, canonical lookup and external discovery. Preserve the serving social Firebase target/codebase/region and auth/attestation policy; parser deploy defaults are not the social target. The candidate retains accepted checkout continuity, Here-level explicit private exact sharing, current public geometry and provider diagnostics.

Canonical preparation no longer scans the catalog. The backend queries a numeric latitude band (limit1001 to detect overflow past1000) plus all legacy string latitudes (limit501 to detect overflow past500). Complete results have five-minute per-server-instance caches with proven coverage and in-flight deduplication. A cold request returns at most1502 catalog records; overflow or an unavailable existing single-field index fails explicitly. Cached retry reuse is conditional on the same server instance, and no production billing claim is made. No new index, paid provider or infrastructure was added; existing free OpenStreetMap/Overpass providers remain the external source.

Physical iPhone adoption, real indoor GPS behavior, production provider availability, exact Holy Whale coordinates and an OTA bundle/release were not verified by this local implementation. Do not describe the live app as fixed until the authorized backend/OTA rollout and device check are complete.
