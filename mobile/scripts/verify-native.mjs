// Fail packaging when generated native configuration or plugin registration is incomplete.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const config = JSON.parse(await read("android/app/src/main/assets/capacitor.config.json"));
assert.equal(config.appId, "ng.com.stockflow.app");
assert.equal(config.webDir, "out");
assert.equal(config.server?.url, undefined, "Never package a remote live-reload website as the Android app");
assert.equal(config.server?.androidScheme, "https");
assert.equal(config.server?.cleartext, false);
assert.deepEqual(config.server?.allowNavigation, []);
assert.equal(config.android?.adjustMarginsForEdgeToEdge, "auto");
assert.equal(config.android?.allowMixedContent, false);
assert.equal(config.android?.webContentsDebuggingEnabled, false);
assert.equal(config.loggingBehavior, "none");
const buildScript = await read("android/app/build.gradle");
assert.match(buildScript, /applicationId "ng\.com\.stockflow\.app"/);
assert.match(buildScript, /android\.buildTypes\.debug\s*\{\s*applicationIdSuffix "\.preview"\s*versionNameSuffix "-preview"\s*\}/);
assert.match(await read("android/app/src/debug/res/values/strings.xml"), /name="app_name">StockFlow Preview/);
assert.match(await read("android/app/src/main/res/values/strings.xml"), /name="app_name">StockFlow<\/string>/);
for (const source of ["MainActivity.java", "SecurePendingPlugin.java", "SecurePendingStore.java"])
  assert.equal(await read(`android/app/src/main/java/ng/com/stockflow/app/${source}`), await read(`native/android-src/${source}`), `App-owned native source ${source} must be copied after cap sync`);
assert.match(await read("android/app/src/main/java/ng/com/stockflow/app/MainActivity.java"), /registerPlugin\(SecurePendingPlugin\.class\);\s*super\.onCreate/);
const plugins = JSON.parse(await read("android/app/src/main/assets/capacitor.plugins.json"));
for (const name of ["@capacitor/app", "@capacitor/barcode-scanner", "@capacitor/share"])
  assert.ok(plugins.some((plugin) => plugin.pkg === name), `${name} must be registered in the packaged Android app`);
const manifest = await read("android/app/src/main/AndroidManifest.xml");
for (const attribute of ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"', 'android:networkSecurityConfig="@xml/stockflow_network_security"', 'android:dataExtractionRules="@xml/stockflow_data_extraction_rules"'])
  assert.ok(manifest.includes(attribute), `${attribute} must survive native configuration`);
for (const resource of ["stockflow_network_security", "stockflow_backup_rules", "stockflow_data_extraction_rules"])
  assert.ok((await read(`android/app/src/main/res/xml/${resource}.xml`)).startsWith("<?xml"));
assert.doesNotMatch(await read("android/app/src/main/res/xml/file_paths.xml"), /external-path|root-path|path="\."/);
const index = await read("android/app/src/main/assets/public/index.html");
assert.ok(!index.includes('/workspace/_next/'), "Native assets cannot contain web-only /workspace route prefixes");
assert.match(index, /StockFlow/);
console.log("PASS Android local assets, plugin registration, system-bar insets, HTTPS and backup policy");
