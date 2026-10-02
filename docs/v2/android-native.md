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
| Data backup | Cloud backup disabled; explicit cloud/device-transfer exclusions for app, database, WebView and device-protected data | This does not replace server backups or encrypt offline transaction intent storage |
| Camera | Runtime camera permission; rear camera, any camera and autofocus declared optional | Product/SKU lookup remains available on devices without a usable camera |
| Sharing | Exact `@capacitor/share` 7.0.4; text receipts via native chooser; FileProvider narrowed to a receipts-only cache path | No storage permission, file export, printer SDK, automatic WhatsApp sending or delivery guarantee |
| Release | Debug APK and unsigned release AAB build workflow | Neither is a signed Play release |

## Native interaction contract

- Android Back closes the current drawer/detail or cart before leaving the section. A non-home section returns to Home without silently abandoning a sale. Home Back minimizes the task. Lock/transaction-in-progress handling must never reveal a previously protected screen.
- Authentication screens require their own Back handling: the pinned App plugin otherwise consumes Back on a page with no browser history. Route handlers must remove their own listeners on unmount.
- A camera or share-sheet handoff must not cause a spurious password prompt every time it opens. Any exception must be scoped to an actual pending native operation with a time bound, preserving ordinary background and idle locking.
- Scanner denial, camera unavailable, cancellation and unknown SKU lead back to a usable product search. A canceled native share is not a failed sale and must never retry checkout.
- Process death requires sign-in. Existing request identities survive page refresh in sessionStorage; durable recovery after Android process death is still a release gate. A lost response must be reconciled before another sale is created, and no process-kill-safe sync claim is made.

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
