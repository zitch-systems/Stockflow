# StockFlow Android platform package

The Android app packages the local StockFlow workspace and uses the same authenticated API contracts as the web workspace. A native camera scanner and Android share sheet support selling and receipt delivery. The package does not load the marketing website as its start page.

## Platform decisions

| Area | Implemented configuration | Verification limit |
| --- | --- | --- |
| Application | Release: `ng.com.stockflow.app`, StockFlow, version 2.0.0/build 20000. Debug: `ng.com.stockflow.app.preview`, StockFlow Preview, version 2.0.0-preview | Preview installs alongside the commercial app; existing Play identity/signing account not available |
| Android versions | Minimum API 26; compile/target API 36 | Android 8–16 hardware acceptance remains required |
| Build tooling | AGP 8.10.1, checksum-pinned Gradle 8.11.1, JDK 21 in CI | Successful CI run must be linked to its exact commit |
| Navigation/insets | Capacitor Android `adjustMarginsForEdgeToEdge: auto`; keyboard `adjustResize` | Gesture/three-button navigation, cutouts, keyboard and rotation must be checked on device |
| Visual identity | Jade launch background/icon, StockFlow theme, explicit transition to app theme | Android cold-start/recent-task presentation requires device observation |
| Transport | Local HTTPS app origin, no remote start URL or internal external-site allowlist; mixed/cleartext traffic disabled; system certificate trust | This is not certificate pinning and does not verify the live server configuration |
| Data backup | Cloud backup disabled; explicit cloud/device-transfer exclusions for app, database, WebView and device-protected data | Server backup/restore remains a separate release requirement |
| Unresolved operation | Android-only `StockFlowPending` plugin writes AES-256/GCM ciphertext to private preferences using a non-exportable Android Keystore key, before API submission | Emulator instrumentation and complete client/server retry evidence are required before certifying recovery |
| Camera | Runtime camera permission; rear camera, any camera and autofocus declared optional | Product/SKU lookup remains available on devices without a usable camera |
| Sharing | Exact `@capacitor/share` 7.0.4; text receipts via native chooser; FileProvider narrowed to a receipts-only cache path | No storage permission, file export, printer SDK, automatic WhatsApp sending or delivery guarantee |
| Release | Debug APK and unsigned release AAB build workflow | Neither is a signed Play release |

## Native interaction contract

- Android Back closes the current drawer/detail or cart before leaving the section. A non-home section returns to Home without silently abandoning a sale. Home Back minimizes the task. Lock/transaction-in-progress handling must never reveal a previously protected screen.
- Authentication screens require their own Back handling: the pinned App plugin otherwise consumes Back on a page with no browser history. Route handlers must remove their own listeners on unmount.
- A camera or share-sheet handoff must not cause a spurious password prompt every time it opens. Any exception must be scoped to an actual pending native operation with a time bound, preserving ordinary background and idle locking.
- Scanner denial, camera unavailable, cancellation and unknown SKU lead back to a usable product search. A canceled native share is not a failed sale and must never retry checkout.
- Process death requires sign-in. Android pending intents are prepared for durable encrypted recovery through the app-owned Keystore plugin; browser/iOS behavior is separate. Each intent contains the original request UUID, authoritative tenant UUID and parameters. A tenant reassignment must block replay and preserve the prior intent. A lost response must be reconciled before another sale is created. Actual emulator force-stop recovery and complete backend replay remain evidence gates until their tests pass.

## Reproducible checks

From `mobile/` after installing locked dependencies:

```sh
node --test scripts/native-policy.test.mjs
npm run build
npx cap add android             # only when android/ does not exist
npx cap sync android
npm run native:configure
node scripts/verify-native.mjs
```

`verify-native.mjs` checks the actual generated package inputs: local routes, HTTPS settings, system-bar handling, backup XML and app/scanner/share plugin registration. Re-running configuration is tested to preserve launch/provider entries and produce the same manifest/theme.

The native CI job installs Android platform/build-tools 36, builds `assembleDebug bundleRelease`, then runs `scripts/verify-apk.mjs` against the compiled APK/AAB. It checks application ID, SDK levels, optional camera hardware, merged permissions, resource references, packaged plugin list, debug signing and absence of a release-bundle signature. It checks 16 KB ZIP alignment and each packaged 64-bit ELF library's load alignment. Device runtime behavior and memory-page compatibility still require device/emulator execution.

`native/android-src/` contains app-owned Java source copied into the generated project after every sync. `StockFlowPending.get/put/remove` only accepts actor UUID + one of five V2 operation names. Values are strict JSON objects with exactly `key` (request UUID), `tenantId` (tenant UUID) and `parameters` (object), up to 256 KiB UTF-8. AES/GCM additional authenticated data binds ciphertext to the app and actor/operation slot. Put refuses differing unresolved data; remove requires the original request UUID. Failed disk commits, missing keys or failed decryption block further submission rather than silently replacing an intent. A failed commit also blocks in-process cache acknowledgements. The plugin never stores session credentials or logs payloads. Capacitor bridge logging is disabled in preview and release because its debug mode otherwise logs plugin arguments.

The Android CI emulator suite exercises actual Keystore/preferences, ciphertext on disk, re-instantiation, no-overwrite/concurrent writes, conditional deletion, bad inputs, swapped ciphertext, missing key, commit-failure handling, tenant replacement rejection and real Capacitor bridge registration. Separate `adb am instrument` runs verify three restart scenarios: original UUID recovery, corrupt XML rejection without replacement, and recovery from Android's valid `.bak` despite a corrupt main XML file. Android's preference load and backup recovery finish before an independent strict disk parse/cache comparison; a checked file-descriptor sync follows each successful write. These tests require no business accounts or server writes. Reports are uploaded even when testing fails. Clearing app data/uninstalling or losing the Keystore requires server-side reconciliation; local storage cannot survive those actions.

The workflow uploads the debug APK, explicitly unsigned AAB and `android-package-verification.json`, including artifact SHA-256 hashes. The debug build has a separate application ID, launcher name and version suffix so installing it does not overwrite the commercial app. It keeps the same explicitly configured backend URL: **Preview is an installation label, not a separate data sandbox.** Use it only for controlled testing against an approved backend after the required migrations and data-integrity/authentication checks. No production migration or signing credential is embedded in this work.

## Required device acceptance before release

1. Cold start → register/verification or sign in → authoritative role/workspace → product lookup.
2. Camera permission allow/deny/revoke → barcode match/unknown/cancel → cart quantity/customer → payment record → one receipt.
3. Android Back at login, home, nested details, cart and during checkout; gesture and three-button navigation.
4. Receipt share open/cancel/return; scanner open/return; ordinary background/foreground and five-minute inactivity lock.
5. Offline checkout rejection, connection loss after submit, process kill/relaunch and retry with the original transaction key.
6. Small phone, tablet, large text, portrait/landscape, screen cutouts and software keyboard on Android 15/16; 16 KB emulator/device.
7. Signed release build with the owner-controlled keystore, verified live backend migration, privacy/data-safety declarations and actual Play Console pre-launch results.

## Primary references checked 2026-10-02

- [Capacitor 7 configuration](https://capacitorjs.com/docs/v7/config): local assets, HTTPS, navigation, logging and edge-to-edge configuration.
- [Capacitor 7 App plugin](https://capacitorjs.com/docs/v7/apis/app): Back events, listener cleanup, lifecycle and task minimization.
- [Capacitor 7 Share plugin](https://capacitorjs.com/docs/v7/apis/share): native text sharing.
- [Android backup controls](https://developer.android.com/identity/data/autobackup): Android 12+ device-transfer rules beyond `allowBackup=false`.
- [Android network security](https://developer.android.com/privacy-and-security/security-config): cleartext restrictions and certificate trust.
- [Android feature declarations](https://developer.android.com/guide/topics/manifest/uses-feature-element): optional camera hardware.
- [Play target-API requirements](https://support.google.com/googleplay/android-developer/answer/11926878): API 36 for submissions from August 31, 2026.
- [AGP 8.10 compatibility](https://developer.android.com/build/releases/agp-8-10-0-release-notes): API 36 support with Gradle 8.11.1.
- [Android 16 KB page-size checks](https://developer.android.com/guide/practices/page-sizes): ZIP and ELF alignment plus runtime validation.
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore) and [SharedPreferences commit](https://developer.android.com/reference/android/content/SharedPreferences.Editor#commit()): app-scoped non-exportable AES keys and synchronous durable-write acknowledgement.
