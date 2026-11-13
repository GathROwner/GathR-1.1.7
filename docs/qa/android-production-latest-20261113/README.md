# Latest GathR UI on Android Production

Craig requested the latest accepted version on Android Production. The release merges the current Android OTA source `ad38037` with the latest iOS application source `bcc4701`. Every application file matches the latest iOS version; the Android draft-submission profile and its configuration verifier are preserved. Android tablet dock spacing, system/taskbar clearance and full-window map scale positioning remain in the shared implementation.

The native configuration, dependencies, patches and Production build environment match the existing Android 1.1.20 build 14. This was an Android-only OTA; no native build, store submission or backend change occurred. Production Firebase, Play Integrity, both social flags and Mapbox were verified explicitly at export/publication time.

Validation: TypeScript, 448 tests across 39 suites, lint with zero errors (227 existing warnings), native compatibility guard, Mapbox preflight, and clean Android export passed. The bundle contains 2,575 modules and EAS reports 112 Android assets. Actual markers and the compact selector were rendered using Android props and reviewed. Compact map text styles retain the previously reviewed real Mapbox render. This is rendered/shared-code evidence, not physical Android device adoption proof. The old Android debug emulator's graphics limitation from the prior task is not represented as a successful native check.

Expo readback confirms group `c7788ad8-fdd9-42e1-bc96-b4fbff6bbd25`, Android update `01a1d71c-b047-730d-938b-6e1df947c56e`, commit `4ad22b6bf7910c827ff0e9563b4a6bbbca3f8f5e`, branch Production and runtime 1.1.20. It is the newest Android Production update. iOS remains on its existing group `d097e6cb-3947-4ba0-b42a-430114c88b7c`.
