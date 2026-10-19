# Minimum supported app version

GathR can show an update-required notice on opening or returning to the foreground. It checks the installed native store version (`expo-application.nativeApplicationVersion`), never the OTA runtime or manifest version. The Update GathR button opens the fixed App Store / Google Play listing; it does not install an update itself. Navigation stays mounted underneath the notice so a policy retry does not reset app state.

## Starting state and scope

The initial policy in `config/minimum-versions.disabled.json` targets 1.1.20 but disables enforcement and store availability for **both** platforms. Only a non-development native installation on the `production` update channel reads/enforces the live policy. Preview, development and web cannot be blocked by it. Production publication and activation are separate release decisions and remain held.

In Preview: open Profile, tap the version footer, then **Preview update notice**. This opens the actual shared notice with a clear Preview banner and close button. Update explains its real action without opening the store; Check again returns to Profile. This is a design demonstration, not evidence of a real Production lock or successful store installation.

## Public policy

One non-sensitive Firebase Storage object: `gs://gathr-m1.firebasestorage.app/app-config/minimum-versions.json`. Its public download URL is `MINIMUM_VERSION_POLICY_URL` in `utils/minimumAppVersion.ts`. The token grants download access to that object, not administrative access or access to any event/user data. No Firebase rule, IAM, backend route or native dependency change is needed.

The policy schema is versioned. Each platform has independent, strict boolean `enabled` and `storeReleaseAvailable` flags and a numeric three-part `minimumVersion`. iOS also requires `minimumOSVersion`; Android requires `minimumApiLevel`. Unrecognized schema, invalid platform data, unavailable native/OS versions or a device below the target OS requirements bypass enforcement. A malformed iOS entry does not affect Android, or vice versa. Store URLs cannot be replaced by remote data.

Fetches are anonymous, use no-store caching, and have a 2.5-second deadline covering the body as well as the connection. Missing, offline, malformed, failed or timed-out policy checks allow access, including when retrying a previously visible gate. There is no persisted mandatory-policy cache. Startup checks run alongside existing startup work; ordinary foreground checks are throttled to one per minute. A blocked app checks immediately on return from the store, and the Check again button bypasses the throttle. Concurrent checks share one request; unmount cancels it.

## Hosting and future activation

First hosting must create the object only if absent (`--if-generation-match=0`), with JSON content type, `Cache-Control: no-cache,max-age=0,must-revalidate`, and custom metadata `firebaseStorageDownloadTokens` equal to the token in the client URL. If the object already exists, read it and reconcile instead of overwriting it. Verify the unauthenticated exact client URL returns the disabled JSON. An upload alone is not verification. Initial hosting completed October19,2026 after Craig refreshed Google Cloud sign-in; the exact client URL returned HTTP200 and both disabled platform entries. See the [release record](qa/minimum-version-gate-20261019/RELEASE.md).

For any later policy edit, first read and retain the existing object, generation and metadata. Preserve its download token. Use a generation precondition so concurrent edits cannot be silently overwritten, then verify the exact client URL without authentication. Turning a platform's `enabled` flag off is the emergency rollback; a foreground/manual check releases an existing notice. No restart or native rebuild is needed for a policy edit once this checker is installed.

Before enabling either platform:

1. Obtain Craig's authorization for that platform and minimum. Verify the target native version is publicly installable in the intended store regions/accounts; a submitted or reviewed build is insufficient.
2. Verify the target binary's minimum OS/API and other store compatibility restrictions. The initial iOS15.1 value matches `app.config.js`; Android API24 matches the installed SDK54 Gradle default. Confirm these against the actual target store build before activation. An OS check cannot detect every store/device restriction.
3. Deliver the checker to the older supported Production runtime(s) through separately authorized compatible OTAs. New native builds alone cannot make old code enforce a policy it has never received. Verify native version, channel, runtime and OTA adoption on actual old/new installations. An OTA may need a subsequent launch to apply.
4. Activate `enabled` and `storeReleaseAvailable` only for the verified platform. Test older version blocked, current/newer version allowed, correct store destination, foreground retry, remote disable and offline recovery. Confirm iOS and Android independently.

This feature does not silently install native updates, force users whose old app has never received the checker, or guarantee that every device can install the target version. It enforces a deliberate minimum after successful policy retrieval, rather than automatically requiring every newly released build.
