# StockFlow Android transaction-review preview

[Download StockFlow-Preview.apk directly](https://github.com/zitch-systems/Stockflow/releases/download/stockflow-v2-android-preview-20261008/StockFlow-Preview.apk). In GitHub mobile, open **zitch-systems → Stockflow → Releases → StockFlow V2 — Android testing preview → Assets → StockFlow-Preview.apk**. Open the downloaded APK and tap Install; allow installation from the browser/files app when Android asks. Android 8.0 or newer is required. No ZIP extraction is needed. The installed app is **StockFlow Preview**. Use your existing StockFlow account.

[Release page](https://github.com/zitch-systems/Stockflow/releases/tag/stockflow-v2-android-preview-20261008). Publication workflow 37791807272 passed archive and uploaded-APK digest verification. This is the exact APK from the verified native run, renamed for direct installation.

You can test login, navigation, inventory/customer/sales browsing, search, theme and the sale-building screen. The actual backend does not yet contain V2. The app shows preview mode and pauses checkout, cancellation and form saves. This is not a separate data sandbox or production-transaction acceptance build. Existing business records are preserved. It does not fall back to old mutation APIs.

Native build/package policy, Android 16 encrypted-pending-store instrumentation (11 tests) and three forced-process-restart scenarios passed. Physical camera/share/keyboard/lifecycle behaviour still needs device testing. This debug package is not signed for Play distribution. Evidence and archive identity: [transaction-preview-results.json](transaction-preview-results.json).

The original Actions archive expires on 22 October 2026; the Release APK is separately published. The result file records both the original archive digest and the released APK digest. Earlier preview packages may have different debug signing certificates; preserve any unconfirmed operations before replacing an installed preview.

Live saves require verified encrypted database and Storage backups, successful isolated restore, historical reconciliation, real-JWT permission acceptance and compatible forward deployment. Full PO creation/edit/cancellation and pending-payment edits remain paused. See [the transaction review](../v2/transaction-integrity-review.md) for completed improvements and unresolved gates.
