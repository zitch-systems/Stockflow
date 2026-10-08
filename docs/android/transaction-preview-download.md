# StockFlow Android transaction-review preview

[Download the Android preview ZIP](https://github.com/zitch-systems/Stockflow/actions/runs/37780736041/artifacts/11552521995). Sign in to GitHub if prompted, extract `app-debug.apk`, open it on an Android 8.0 or newer phone and allow installation from the browser/files app when Android asks. The installed app is **StockFlow Preview**. Use your existing StockFlow account.

You can test login, navigation, inventory/customer/sales browsing, search, theme and the sale-building screen. The actual backend does not yet contain V2. The app shows preview mode and pauses checkout, cancellation and form saves. This is not a separate data sandbox or production-transaction acceptance build. Existing business records are preserved. It does not fall back to old mutation APIs.

Native build/package policy, Android 16 encrypted-pending-store instrumentation (11 tests) and three forced-process-restart scenarios passed. Physical camera/share/keyboard/lifecycle behaviour still needs device testing. This debug package is not signed for Play distribution. Evidence and archive identity: [transaction-preview-results.json](transaction-preview-results.json).

The artifact expires on 22 October 2026. The download digest identifies the GitHub ZIP archive, not the inner APK. Earlier preview packages may have different debug signing certificates; preserve any unconfirmed operations before replacing an installed preview.

Live saves require verified encrypted database and Storage backups, successful isolated restore, historical reconciliation, real-JWT permission acceptance and compatible forward deployment. Full PO creation/edit/cancellation and pending-payment edits remain paused. See [the transaction review](../v2/transaction-integrity-review.md) for completed improvements and unresolved gates.
