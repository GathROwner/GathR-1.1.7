# Preview update notice: real store handoff

Craig confirmed iOS Preview OTA01a15451 adoption, the version dialog and the full update notice with phone screenshots at10:56–10:58 on October19. He then approved testing the real store handoff while retaining disabled enforcement and the Production hold.

Starting owned checkout carousel-boundaries / codex/feed-optimization-20261018, clean HEADc2f4078. Independently reread EAS list/view: latest iOS Preview source ebc3eac1b11e224961e17cb584c567565188f4a4, update01a15451-d766-70db-8a34-8157d76231dd, groupb08244fc-fc6e-45a1-8b34-a16a9c85ead0, runtime1.1.10. This accepted source is retained in ancestry.

Profile's Preview notice now opens the actual platform store URL instead of an explanatory alert. It uses `useAppStoreLink`, shared with the real gate, so the tested handoff/error handling cannot silently diverge. No store opens on mounting. Opening the listing does not install an update. Existing close controls remain available on return; Preview Check again still closes the sample rather than enforcing a remote minimum. Failed opening shows the existing recovery message, retries clear that error, and opening a fresh sample resets it.

The actual UpdateRequiredNotice component, styles, Preview banner and modal layout are unchanged from the user-rendered phone screenshots. This callback-only change needs no new visual design. Existing component render evidence and Craig's actual native screenshots establish the unchanged appearance; automated tests prove the requested URL and error handling, not an actual phone/App Store transition. Apple's public page could not be read by the web tool; no public store availability/version assertion is made. Native store opening and return await Craig's phone check after publication.

Validation: TypeScript passes, lint0errors/215existing warnings, five suites/56tests pass, including native minimum evaluation/lifecycle, fail-open retrieval, both real-gate store destinations, modal behavior and shared-link tap-only opening/error recovery/reset. Initial new tests retained call history from React Native's pre-mocked Linking method; explicit per-test mock reset fixed the harness, with no runtime workaround. Anonymous live policy readback remains HTTP200 with enabled:false and storeReleaseAvailable:false for both platforms. No policy write or activation.

No GathR map operation, new native build, native/config/runtime/dependency change, Production/Android publication, backend deployment or data mutation. All accepted list/ad/callout/logo/save changes are preserved. Publication/source/export details will be recorded in RELEASE.md. Raw logs/readbacks: ignored artifacts/update-store-handoff-20261019/.

Phone test: reopen Preview twice if necessary, confirm the new OTA in Profile, tap version footer → Preview update notice → Update GathR. Confirm the App Store shows GathR's listing, then return to GathR and close the sample. Installing is not required for this handoff test.
