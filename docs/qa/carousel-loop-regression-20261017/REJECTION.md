# Emulator connection approval-review evidence

Historical prepublication verification record. No reconnect workaround was attempted. Craig later independently waived the missing post-fix visual check and authorized iOSPreview-only publication; see RELEASE.md. The rejected emulator actions and visual gap below remain unchanged.

Both calls used `functions.exec` -> `tools.exec_command`, cwd `C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54`. Both were rejected by CreateProcess before execution. Available reason: **`rejected: blocked by policy`**. No specific justification or remedy was returned. Escaped command echo in the tool response was truncated; complete requested command text is retained below.

First rejected command:

```powershell
node artifacts/carousel-loop-regression-20261017/verify-host.cjs; & 'C:\Users\craig\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s emulator-5554 reverse tcp:8081 tcp:8081; & 'C:\Users\craig\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp+gathr://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.craigb.gathr; curl.exe --max-time 20 -s -H 'Expo-Platform: android' -H 'Expo-Runtime-Version: 1.1.10' -H 'accept: application/expo+json,application/json' http://127.0.0.1:8081/ -o artifacts/carousel-loop-regression-20261017/manifest-after.json
```

The coordinator subsequently relayed fresh direct user authorization: **"I approve connecting to the emulator"**, explicitly covering connection to the local QA server and the necessary local development-manifest read. Under that new approval, the bounded connection was attempted once more:

```powershell
& 'C:\Users\craig\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s emulator-5554 shell input tap 380 1380; & 'C:\Users\craig\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s emulator-5554 reverse tcp:8081 tcp:8081; & 'C:\Users\craig\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp+gathr://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.craigb.gathr; curl.exe --max-time 20 -s -H 'Expo-Platform: android' -H 'Expo-Runtime-Version: 1.1.10' -H 'accept: application/expo+json,application/json' http://127.0.0.1:8081/ -o artifacts/carousel-loop-regression-20261017/manifest-approved.json
```

The first tap would have selected Wait on the existing Android System UI ANR dialog. The call was rejected before that tap or any following action executed. Same available reason: **`rejected: blocked by policy`**. No equivalent reconnect was attempted through another tool, shell, script or URL after either rejection.

Read-only screen acquisition **did succeed** between the two rejected connection attempts: `node artifacts/carousel-loop-regression-20261017/capture.cjs 99-current-read-only-screen`, which only invokes existing ADB `exec-out screencap -p` and writes a PNG. `99-current-read-only-screen.png` shows the Android launcher with a **System UI isn't responding** dialog. No GathR lightbox/client is currently loaded on that screen, so the permitted snapshot cannot verify the patch.

Last observed emulator: existing s24/emulator-5554, qemu process120148, `-gpu swangle -no-snapshot-load`, same installed app/data and screen density. Two prior qemu crashes on Lavapipe reported Windows exception0xc0000005. Current QA Metro is stopped again, normal root/index routes restored byte-for-byte, map route restored to intended four-line candidate, both temporary runtime modules/QA environment removed. No release occurred. Do not treat the reconnect approval as publication authorization or the before-fix native capture as post-fix acceptance.
