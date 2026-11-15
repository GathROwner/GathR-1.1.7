# Cold-start map cache handoff

Craig reproduced slow cluster appearance after removing GathR from the app switcher and reopening. Warm returns have been immediate. This change addresses the reproduced startup cache handoff; total native cold-start time is not yet measured on Craig's iPhone.

## Resulting behavior

- The startup hook waits for actual persisted-query restoration and account readiness, then immediately publishes valid saved events. It replaces the fixed 180 ms preload timer.
- Startup hydration explicitly opts into projecting the latest requested viewport, even if its initial fetch is still pending. It uses the existing partition, filters, expiry checks and clustering path. A bare setAllEvents call retains its previous global-cache-only contract for other producers.
- The unfiltered map boot request shares the root QueryClient request. Newly restored data can appear before that fetch resolves; its fresh success still reaches the newest requested map view.
- A successful empty refresh clears obsolete saved markers. Failed background refreshes retain usable saved markers. Expired saved items do not masquerade as a completed empty startup response.
- A missing QueryClient entry no longer hides still-valid store data while refreshing.
- Newer started view requests retain ownership; merely reserving a cancellable replacement does not invalidate the current request. An old type-scoped response is discarded if the requested event type changed.
- The root cache subscription watches only the feed's successful updates, deduplicates identical notifications and is removed on unmount. It does not create an active Query observer or change cache lifetime. Existing native configuration, normalized cache keys, account environment and event eligibility rules are preserved.

The 1200 ms recovery remains a fallback. A valid cache handoff no longer waits for it. A launch with no valid saved data still requires a network response. GPS, native basemap load and annotation bitmap readiness remain separate possible contributors to perceived startup time.

## Validation and visual evidence

The new tests use the actual Zustand store, real QueryClient and real persisted-query provider with controlled restoration and network completion. They cover cache/no cache, fresh/stale restoration, expired data, empty and offline responses, overlapping requests, current filters/private friend projection, type changes, unmount cleanup, shared-request deduplication and auth readiness. Native Mapbox drawing and server I/O are not exercised by this harness.

The broader validation includes store expiry/filtering, detail/callout contracts, source-cache compatibility, MainNavigator subscription stability, request ordering, viewport membership, Hybrid tap delivery and redraw budgets. One existing opt-in detail-operation benchmark remains skipped (`GATHR_DETAIL_MERGE_REPORT`). The older latency test harness assumed recording started automatically; the accepted baseline reproduced the same four failures. That harness now explicitly starts/stops capture, preserving the dormant production recorder.

New actual-component RN Web marker-grid and selector renders were independently reviewed. The selector screenshot uses Craig's reference photo and remains in local ignored artifacts (`artifacts/cold-start-20261115/ios-after/selector.png`); it is not added to Git. Marker grid RGB pixels and the complete authored selector panel match the accepted release. The static reference-photo region below the selector differs between screenshots; full-selector screenshot pixel identity is not claimed. Root JSX AST and map, legend, annotation and callout component sources are unchanged. These fixtures verify accepted layout and hierarchy; they do not measure native cold-start speed.

## Release scope

This iteration targets iOS Production runtime 1.1.20, assembled on its exact live baseline 791c4cb in the retained independent ghr-tap checkout. The initial cache-handoff group c8231195-0823-4fed-a1ed-df78e239282a was followed by the final account-readiness/type-order guard refinement. PUBLISHED_IOS.json records the final newest platform update and server readbacks. Android, Preview and Development retain the accepted Hybrid tap releases from the prior all-target rollout; this cold-start candidate is not described as adopted there.

Craig subsequently clarified that cached force-close/reopens were already fast. That comparison does not reproduce or validate a repair for his original first-data-pull delay. See [automatic startup timing](../startup-timing-20261115/README.md) for the separately authorized instrumentation. No original-symptom improvement is claimed from the cached restart.

Raw validation, environment, export/publish and readbacks are archived under artifacts/cold-start-20261115/. The new permanent regression suite is store/__tests__/coldStartCache-test.tsx.

Final server-verified release: group `c28bdfa5-459f-4b6e-87db-29632be01d28`, OTA `01a1e01e-8b9f-77db-846e-2eb61e78b627`, source `77bdcee8f998a0a125d097463d3a639ea320a843`, iOS Production runtime 1.1.20. The clean export bundled 2577 modules and 112 final EAS assets. Final validation: 143 tests passed across 16 suites, one existing skip, TypeScript passed, lint zero errors/226 warnings. The retained release checkout is clean and implementation/protected dependency snapshots are unchanged. Phone adoption and measured startup improvement await Craig's comparison.
