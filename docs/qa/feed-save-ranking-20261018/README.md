# Deferred saved-first feed ranking

Craig confirmed iOS Preview OTA01a150eb was adopted and repeated flashing persisted. The clipping-off comparison did not resolve the symptom. He approved restoring clipping and the separate UX change: save immediately, retain the card's place while browsing, apply saved-first order on returning or refreshing. This remains an iOS Preview test; no claim of an on-device jitter fix before feedback.

## Implementation

- Both Events and Specials restore removeClippedSubviews=true, exactly as before the unsuccessful comparison.
- useDeferredSavedRanking keeps a per-feed in-memory set of saved IDs for ranking. Live saved IDs still drive star state, Saved-only membership and analytics. Initial preference hydration, account/filter/search context changes, returning to a focused tab and explicit pull-to-refresh update the ranking snapshot. Ordinary save/unsave acknowledgements, pagination and unrelated rerenders do not.
- The existing optimistic bookmarked state now also drives the existing hero Saved badge, giving immediate feedback and retaining existing rollback behavior.
- A changed saved-ranking snapshot increments a revision used as the FlatList key. At the approved boundary, the new order starts at the top with fresh row measurements. Unchanged return/refresh preserves the key and position; a save tap never changes it. No permanent row remount, duplicate Saved section, delayed server persistence or additional save call.
- Pull-to-refresh applies the latest saved-first order from local state and finishes its indicator after the render. It does not refetch backend records; existing event updates remain live. Frame callback cleans up on unmount.
- Existing scoring/time/filter policies, chronological venue paging, grouping/per-card optimizations, ad ownership/placements, lightboxes and native/config/runtime dependencies are retained. Live time/data or pre-existing growing-prefix outside pagination can still change ranking for reasons other than the deferred save preference; this patch does not freeze the entire feed.

## Baseline and checks

- Owned branch codex/feed-optimization-20261018, source descends from5452107. Live iOS Preview independently read: update01a150eb-1f1f-7718-9475-b0ab06c85c54/group7e58fe70-287e-4667-889d-44296cb25ac0/source74892804b4a7167e22aed8219ec813c7474bf233/runtime1.1.10. Native Preview remains1.1.10(78).
- New tests execute both actual screen priority functions and grouping with120fixture events/60venue cards: deep save -> multiple acknowledgements/pagination preserves order/revision; refresh or blur/refocus applies saves; unchanged saved-set content does not reset layout; unsave/rollback stays live; hydration/filter/account transitions; actual Saved-only filter membership; refresh callback cleanup.
- Final focused selection5suites/32tests passed, including existing actual-screen list/ad-builder, venue-pager, grouping and per-card preference regressions. TypeScript passed. Full lint0errors/215existing warnings, no new warnings. git diff check passed. Native/config/dependency files match the verified live source.
- Tests use React test renderer with mocked focus and deterministic scoring inputs. They do not render UIKit or prove physical scrolling. No map/device/emulator operation or visual iPhone verification performed. Craig authorized the iOS Preview comparison; physical adoption and changed behavior remain pending after publication.
- No native build, backend deploy/data mutation, Android/Production OTA or store action. Release metadata and guarded source/export/readback follow in RELEASE.md.

## Phone acceptance

After confirming the published short OTA ID in Profile, scroll far down Events/Upcoming and save an unsaved card. Star/Saved badge should react immediately, the venue card should stay in place and further scrolling should remain usable. Switch to another tab and return: saved-first order should apply at the top. Alternatively scroll to the top and pull to refresh. Repeat with Specials and unsaving. Saved-only unsaving intentionally removes an item that no longer matches that filter. Report repeated flashing separately from the previous immediate disappearance UX; absence in one pass is not conclusive for an intermittent issue.
