# iOS Production radius tuning

Published source `36756c0c3ceafb62b313bdc0c7db532d76e43ab1`, retained on `codex/ios-production-hybrid-radius-20261113`, based on exact live source `526cc4a9d4ba9a2f7d95ff793db0daeeccbd67e8`.

- Platform: iOS only; channel/branch production; runtime 1.1.20.
- Group: `f41f2993-8b7e-424c-8214-24005e5558a5`.
- Update: `01a1d4ee-f116-76a0-b5cf-67069154ef5f`.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/f41f2993-8b7e-424c-8214-24005e5558a5).

One publish attempt succeeded. EAS update:list and update:view independently confirmed the newest iOS Production update matches the candidate commit, update ID and runtime. Publication exported 2,566 modules and referenced 112 iOS assets; no new asset uploads were required. No native/configuration/dependency changes, backend writes, or other platform/channel publications.

The clean candidate passed TypeScript, 81 tests, Expo lint (zero errors, 227 existing warnings), Mapbox preflight, Production Firebase/App Check/social guard, iOS Production configuration and a clean export. The actual-component before/after grouping comparison was independently reviewed. Ring/photo sizes, fixed local rotation bounds, summary PNG capture and native gesture/tap handling remain unchanged from the accepted baseline.

Device adoption and exact grouping in Craig's live view remain unverified. Fully close/reopen twice, select Hybrid, and check the Profile footer for Production / runtime 1.1.20 / OTA `01a1d4ee`. The smaller radius and nearer index zoom should separate more widely spaced venues sooner while keeping close neighbors grouped, without a new displacement pass.

Raw logs and EAS readbacks were archived before removing the clean release worktree. Implementation and protected-main dependency states were unchanged by cleanup. The exact published source branch is retained remotely, and the ongoing UI branch contains it.
