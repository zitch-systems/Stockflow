// Run after `cap add`/`cap sync`. No credentials are embedded in source.
import { readFile, writeFile, access, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configureAndroidManifest, configureAndroidStyles, configureAndroidBuildVariants, androidResources, androidPreviewStrings } from "./native-policy.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
async function transform(path, fn) {
  try {
    await access(path);
  } catch {
    return;
  }
  await writeFile(path, fn(await readFile(path, "utf8")));
}
await transform(resolve(root, "android/variables.gradle"), (s) =>
  s.replace(/minSdkVersion\s*=\s*\d+/, "minSdkVersion = 26")
    .replace(/compileSdkVersion\s*=\s*\d+/, "compileSdkVersion = 36")
    .replace(/targetSdkVersion\s*=\s*\d+/, "targetSdkVersion = 36"),
);
// API 36 is required for Play submissions from 2026-08-31. AGP 8.10 supports it
// with the already-pinned Gradle 8.11.1; no new major build-system migration.
await transform(resolve(root, "android/build.gradle"), (s) =>
  s.replace(/com\.android\.tools\.build:gradle:[^'"\s]+/, "com.android.tools.build:gradle:8.10.1"),
);
await transform(resolve(root, "android/gradle/wrapper/gradle-wrapper.properties"), (s) => {
  if (!/gradle-8\.11\.1-(all|bin)\.zip/.test(s))
    throw new Error("Review the Gradle distribution version and checksum before packaging.");
  // Official Gradle CDN and checksum: https://gradle.org/release-checksums/.
  // The smaller binary distribution avoids a redirect and unnecessary sources.
  s = s.replace(/^distributionUrl=.*$/m, 'distributionUrl=https\\://downloads.gradle.org/distributions/gradle-8.11.1-bin.zip')
    .replace(/^networkTimeout=.*$/m, 'networkTimeout=120000');
  const checksum='distributionSha256Sum=f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6';
  return s.includes('distributionSha256Sum=') ? s.replace(/^distributionSha256Sum=.*$/m,checksum) : s.trimEnd()+'\n'+checksum+'\n';
});
await transform(
  resolve(root, "android/app/src/main/AndroidManifest.xml"),
  configureAndroidManifest,
);
await transform(resolve(root, "android/app/src/main/res/values/styles.xml"), configureAndroidStyles);
try {
  await access(resolve(root, "android/app/src/main/AndroidManifest.xml"));
  const resources = resolve(root, "android/app/src/main/res/xml");
  await mkdir(resources, { recursive: true });
  for (const [name, content] of Object.entries(androidResources))
    await writeFile(resolve(resources, name), content);
  const previewValues = resolve(root, "android/app/src/debug/res/values");
  await mkdir(previewValues, { recursive: true });
  await writeFile(resolve(previewValues, "strings.xml"), androidPreviewStrings);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
// App-owned source is committed separately from the generated Capacitor project.
// Register before BridgeActivity creates the bridge, including after every clean cap add.
let hasAndroid = false;
try { await access(resolve(root, "android/app/src/main/AndroidManifest.xml")); hasAndroid = true; }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (hasAndroid) {
  for (const [sourceSet, files] of [
    ["main", ["MainActivity.java", "SecurePendingPlugin.java", "SecurePendingStore.java"]],
    ["androidTest", ["SecurePendingStoreInstrumentedTest.java", "SecurePendingProcessInstrumentedTest.java"]],
  ]) {
    const destination = resolve(root, `android/app/src/${sourceSet}/java/ng/com/stockflow/app`);
    await mkdir(destination, { recursive: true });
    for (const file of files) await copyFile(resolve(root, "native/android-src", file), resolve(destination, file));
  }
}
await transform(resolve(root, "android/app/build.gradle"), (s) => {
  s = s
    .replace(/versionCode \d+/, "versionCode 20000")
    .replace(/versionName "[^"]+"/, 'versionName "2.0.0"');
  if (!s.includes("STOCKFLOW_KEYSTORE_PATH"))
    s +=
      '\n// Release signing is supplied by CI; no debug key is accepted as store signing.\nif (System.getenv("STOCKFLOW_KEYSTORE_PATH")) {\n    android.signingConfigs.create("stockflowRelease") {\n        storeFile file(System.getenv("STOCKFLOW_KEYSTORE_PATH"))\n        storePassword System.getenv("STOCKFLOW_KEYSTORE_PASSWORD")\n        keyAlias System.getenv("STOCKFLOW_KEY_ALIAS")\n        keyPassword System.getenv("STOCKFLOW_KEY_PASSWORD")\n    }\n    android.buildTypes.release.signingConfig = android.signingConfigs.stockflowRelease\n}\n';
  return configureAndroidBuildVariants(s);
});
await transform(resolve(root, "ios/App/App/Info.plist"), (s) => {
  if (!s.includes("NSCameraUsageDescription"))
    s = s.replace(
      /<\/dict>(\s*<\/plist>)/,
      "\t<key>NSCameraUsageDescription</key>\n\t<string>Scan product SKU barcodes to add products to a sale.</string>\n</dict>$1",
    );
  return s;
});
await transform(resolve(root, "ios/App/App.xcodeproj/project.pbxproj"), (s) =>
  s.replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = 2.0.0;")
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = 20000;"),
);
await import('./native-assets.mjs');
console.log(
  "Native configuration prepared: optional camera, HTTPS-only traffic, backup/transfer exclusions, API 26 minimum and release signing hooks.",
);
