import test from "node:test";
import assert from "node:assert/strict";
import { configureAndroidManifest, configureAndroidStyles, configureAndroidBuildVariants, androidResources, androidPreviewStrings } from "./native-policy.mjs";

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:allowBackup="true" android:usesCleartextTraffic="true" android:label="@string/app_name">
    <activity android:name=".MainActivity" android:exported="true" android:windowSoftInputMode="adjustPan">
      <intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter>
    </activity>
    <provider android:name="androidx.core.content.FileProvider" android:exported="false" android:grantUriPermissions="true" />
  </application>
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-feature android:name="android.hardware.camera" android:required="true" />
</manifest>`;

test("native configuration closes transport and backup exposure without changing entry points", () => {
  const result = configureAndroidManifest(manifest);
  assert.match(result, /android:allowBackup="false"/);
  assert.match(result, /android:usesCleartextTraffic="false"/);
  assert.match(result, /android:networkSecurityConfig="@xml\/stockflow_network_security"/);
  assert.match(result, /android:fullBackupContent="@xml\/stockflow_backup_rules"/);
  assert.match(result, /android:dataExtractionRules="@xml\/stockflow_data_extraction_rules"/);
  assert.match(result, /android:windowSoftInputMode="adjustResize"/);
  assert.match(result, /android:label="@string\/app_name"/);
  assert.match(result, /android:name="androidx.core.content.FileProvider" android:exported="false" android:grantUriPermissions="true"/);
  assert.match(result, /<intent-filter><action android:name="android.intent.action.MAIN" \/><\/intent-filter>/);
});

test("camera stays available without excluding devices that use manual SKU search", () => {
  const result = configureAndroidManifest(manifest);
  for (const feature of ["android.hardware.camera", "android.hardware.camera.any", "android.hardware.camera.autofocus"])
    assert.ok(result.includes(`android:name="${feature}" android:required="false" tools:node="replace"`));
  assert.ok(result.includes('xmlns:tools="http://schemas.android.com/tools"'));
  assert.equal((result.match(/android:name="android.permission.CAMERA"/g) ?? []).length, 1);
  assert.doesNotMatch(result, /android.permission.(READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|RECORD_AUDIO|ACCESS_FINE_LOCATION)/);
});

test("repeated cap sync configuration is idempotent", () => {
  const once = configureAndroidManifest(manifest);
  assert.equal(configureAndroidManifest(once), once);
});

test("new template missing expected application fails instead of claiming security configured", () => {
  assert.throws(() => configureAndroidManifest("<manifest></manifest>"), /not recognised/);
});

test("launch splash transitions into the branded inset-compatible theme without duplicate items", () => {
  const styles = '<resources><style name="AppTheme"><item name="colorPrimary">#0000ff</item></style><style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar"><item name="windowNoTitle">true</item></style><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"></style></resources>';
  const result = configureAndroidStyles(styles);
  assert.match(result, /<item name="colorPrimary">#127d5c<\/item>/);
  assert.match(result, /<item name="postSplashScreenTheme">@style\/AppTheme.NoActionBar<\/item>/);
  assert.match(result, /<item name="windowNoTitle">true<\/item>/);
  assert.equal(configureAndroidStyles(result), result);
  assert.throws(() => configureAndroidStyles("<resources/>"), /Missing generated theme/);
});

test("backup rules exclude WebView data, transaction intents and device-protected data for both transfer modes", () => {
  const rules = androidResources["stockflow_data_extraction_rules.xml"];
  for (const mode of ["cloud-backup", "device-transfer"]) {
    const section = rules.split(`<${mode}>`)[1].split(`</${mode}>`)[0];
    for (const domain of ["root", "database", "sharedpref", "device_root", "device_database", "device_sharedpref"])
      assert.ok(section.includes(`<exclude domain="${domain}" path="." />`));
  }
  assert.doesNotMatch(androidResources["stockflow_network_security.xml"], /cleartextTrafficPermitted="true"|src="user"/);
});

test("native receipt share cannot expose the template's entire external storage root", () => {
  const paths = androidResources["file_paths.xml"];
  assert.doesNotMatch(paths, /external-path|root-path|path="\."/);
  assert.match(paths, /<cache-path name="stockflow_receipts" path="receipts\/" \/>/);
});

test("debug preview installs separately while release identity and signing stay intact", () => {
  const source = `android {
    defaultConfig { applicationId "ng.com.stockflow.app"; versionName "2.0.0" }
    buildTypes { release { minifyEnabled false } }
}
if (System.getenv("STOCKFLOW_KEYSTORE_PATH")) { android.buildTypes.release.signingConfig = android.signingConfigs.stockflowRelease }
`;
  const result = configureAndroidBuildVariants(source);
  assert.ok(result.startsWith(source.trimEnd()), "Existing release identity/configuration must be preserved");
  assert.match(result, /android\.buildTypes\.debug\s*\{\s*applicationIdSuffix "\.preview"\s*versionNameSuffix "-preview"\s*\}/);
  assert.equal(configureAndroidBuildVariants(result), result);
  assert.equal((result.match(/applicationIdSuffix/g) ?? []).length, 1);
  assert.match(androidPreviewStrings, /name="app_name">StockFlow Preview/);
  assert.match(androidPreviewStrings, /name="title_activity_main">StockFlow Preview/);
  assert.throws(() => configureAndroidBuildVariants('applicationId "unrelated.app"'), /release application ID/);
});
