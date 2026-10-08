# Updated Android business-flow preview

[Download StockFlow-Preview.apk directly](https://github.com/zitch-systems/Stockflow/releases/download/stockflow-v2-business-preview-20261008/StockFlow-Preview.apk). No ZIP extraction is needed. Android 8.0 or newer; version 2.0.1-preview/build 20001; installed name **StockFlow Preview**.

In GitHub/GitMobile: Stockflow → Releases → Android business-flow preview → Assets → StockFlow-Preview.apk. Download, open and allow installation from the app you used to download it.

Use your existing StockFlow account. More contains supplier orders, returns, rep payments, stock receipts, team and expenses. The preview keeps the existing mobile theme. Owner/manager review actions use protected transactions, but saving remains disabled because the actual V2 backend has not been deployed. Some creation/edit/admin workflows remain unported; this is a testing preview.

The matching Next.js [web workspace](https://stockflow.com.ng/workspace/home/) and root dashboard entry were verified serving the new shared business-flow bundle after PR #27 merged. Refresh an old browser tab; a new sign-in may be required. Legacy administration remains explicitly available.

If Android rejects an update because CI preview signatures differ, uninstall the old preview only after resolving any unconfirmed request, then install this APK. Uninstalling clears local drafts/recovery data, not server business records. Never uninstall to recover an uncertain transaction.

The APK passed package-policy verification, 12 Android 16 instrumentation tests and three forced-restart scenarios; browser CI passed 49 mobile units and 39 workflows. Physical camera/sharing, real JWT/Storage access and production signing are separate requirements.

The security review found a June HACKED tenant-name marker and real authorization defects. Reviewed SQL containment is not installed in production. See [incident evidence](../v2/security-incident-review-20261008.md) and [full flow coverage and gaps](../v2/shared-business-flows.md).

APK SHA-256: `bdf45e1509d4466d30c0727cc7f69527b67ec2fcf236496579a0fb62a22af9f9`. Exact source/artifact/release evidence: `business-preview-results.json`.
