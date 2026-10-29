# Listing video native follow-ups

October 29 addition: explicit Play/Replay/Resume now enables sound through the existing WebView playback path; automatic starts stay muted. See `listing-video-manual-sound-20261029.md`. This OTA behavior does not implement hardware-volume observation below.

## VIDEO-NATIVE-001 - Volume adjustment unmutes the focused playing video

Tag: potential native build. Product intent accepted by Craig on October 29, 2026. Deferred from the OTA refinement batch; no new native build is authorized by this entry.

Desired behavior: a deliberate media-volume adjustment up or down enables sound on the one focused, playing listing video; volume zero stays silent and the sound icon follows the actual mute state. Preserve current playback and use the same rule in cards and fullscreen. Do not start a paused/offscreen video or change other cards.

Current inventory: the accepted app uses react-native-webview 13.15.0 for video and has no installed JS dependency providing system-volume observations. The HTML volumechange event only tracks the video element and cannot establish physical phone-volume interaction. iOS offers AVAudioSession.outputVolume observation, but native-module availability in the exact installed builds must be established before choosing a release path.

Native investigation before any build: distinguish a deliberate media-volume change from initial readings, Bluetooth/audio-route changes, app activation or another app's audio. Check behavior at zero/maximum volume, the silent switch, headphones, background/foreground transitions and manual re-muting. Keep device volume changes under the user's control; do not change volume programmatically. Preserve other audio playback policies.

Reference: https://developer.apple.com/documentation/avfaudio/avaudiosession/outputvolume

Acceptance requires the exact compatible iOS/Android native support, platform-specific tests and physical-device volume-button validation. If no existing bridge is usable, add the narrowly reviewed module in a separately authorized native build. Do not add dependencies/plugins/configuration or simulate hardware-volume events in this OTA.
