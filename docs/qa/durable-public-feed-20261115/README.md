# Durable public event snapshot

Craig approved retaining the last downloaded public feed without a time-based
expiry, filtering it for the current day on-device, and refreshing in the
background. This supersedes the temporary twelve-hour-only bootstrap policy.
It does not change backend capacity or incur an always-on-server setting.

## Behavior

- `lib/publicEventSnapshot.ts` stores one complete normalized public feed in
  existing chunked AsyncStorage, separately from the generic React Query cache.
  The compatibility identifier includes the backend URL and normalized-event
  schema key. It has no age expiry; incompatible/corrupt snapshots are ignored.
- A full successful public download replaces this snapshot, including a valid
  empty result. Type/date/otherwise scoped requests cannot replace the full
  copy. Failed, malformed or page-capped responses throw and cannot clear it.
- Save happens before private merging. Public contributor-specific provenance
  is removed; private submissions and friend events are not included.
- Expired occurrences are pruned with the existing schedule rules on save and
  restore. Current-day/type/search filters and current viewport projection use
  the existing store path. Future and overnight occurrences retain their
  existing semantics; no daily event or unconfirmed holiday is invented.
- Startup reads the public copy while the fresh account-aware feed is pending.
  It never seeds the public copy into React Query as a fresh mixed feed. A late
  read cannot replace a completed network result; unmount cancels publication.
- Failed startup syncs retry while foregrounded: 30s, 60s, 120s, 240s, then at
  most every 300s. Background/inactive stops the retry timer; foreground retries
  a pending failure. Successful sync ends this retry loop. Existing foreground
  and ten-minute feed-marker refresh paths remain.
- Mixed public/private feeds stay in memory and are excluded from new generic
  disk snapshots. Deserialization also removes mixed feeds saved by older app
  versions. Other query persistence retains its existing twelve-hour policy.
- Fresh mixed responses carry account identity. Account switches/sign-out clear
  mixed queries and the old map projection, and old-account responses are
  rejected. API and store in-flight joins are account-aware. No account IDs or
  event contents were added to diagnostic logs.
- Complete public refresh ordering prevents a slower earlier request from
  replacing a newer one. Chunked writes retain the prior committed generation
  on storage failure. Saving to disk does not block publishing a network result.

## First adoption and limits

The new public snapshot is populated by the first successful full download
running this update. A pre-update mixed snapshot is not promoted into an
indefinitely retained public snapshot: private extraction can override content
while retaining the public source label. That first download may still wait for
the existing backend; subsequent launches can use the independent public copy.

This is full-feed reconciliation, not a backend delta-sync protocol. It does
not reduce the existing eight HTTP pages or remove server cold-instance startup.
Offline copies cannot contain newly published changes until a sync succeeds.
If all saved occurrences have expired, the app correctly has no current cached
events to display. Storage clearing/reinstallation can still remove the copy.

## Verification

Actual QueryClient/provider and store fixtures cover a days-old saved copy with
no generic query restoration, current-day filtering while download is pending,
late disk versus fresh-server ordering, failure retention, empty-result removal,
background/foreground retry and cleanup. Snapshot tests cover months-long age,
overnight cutoff, schema mismatch, corruption, storage failure, replacement,
private exclusion and out-of-order completions. API tests exercise all-page
completion, failed/malformed/truncated feeds, pre-merge isolation and account
switches. AuthProvider tests cover direct account switches, legacy unowned
feeds and sign-out while retaining the separate public copy.

Prior full regression: 38 suites, 291 passed, two existing skips (opt-in detail
benchmark and the documented stale cache-key assertion). Final release checks
and publication receipt are recorded alongside this file. TypeScript and lint
must pass before publication. No native dependencies, Firebase environment,
server code, cloud settings, marker paint, tap delivery or ripple timing change.

The accepted marker/pulse files are compared byte-for-byte with live iOS source
`8ea6d967ccf077397215c4c05a809adf7bb76b64`. No map UI automation was performed.
Tests demonstrate the data handoff and ordering, not iPhone startup speed or
pixel visibility. Device adoption and an on-device restart remain unverified
until Craig observes the published update.
