// Inspect the compiled artifact, not only source templates. Run after assembleDebug + bundleRelease.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
assert.ok(sdk, "Android SDK location is required for compiled-package verification");
const analyzer = resolve(sdk, "cmdline-tools/latest/bin/apkanalyzer");
const signer = resolve(sdk, "build-tools/36.0.0/apksigner");
const oneArtifact = async (directory, extension) => {
  const files = (await readdir(resolve(root, directory))).filter((file) => file.endsWith(extension));
  assert.equal(files.length, 1, `Expected one ${extension} artifact`);
  return resolve(root, directory, files[0]);
};
const apk = await oneArtifact("android/app/build/outputs/apk/debug", ".apk");
const bundle = await oneArtifact("android/app/build/outputs/bundle/release", ".aab");
const command = (executable, args) => execFileSync(executable, args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }).trim();
const manifest = command(analyzer, ["manifest", "print", apk]);
const getAttribute = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const application = manifest.match(/<application\b[^>]*>/)?.[0] ?? "";
const metadata = manifest.match(/<manifest\b[^>]*>/)?.[0] ?? "";
const usesSdk = manifest.match(/<uses-sdk\b[^>]*>/)?.[0] ?? "";
assert.equal(getAttribute(metadata, "package"), "ng.com.stockflow.app.preview");
assert.match(getAttribute(metadata, "android:versionName") ?? "", /-preview$/);
const badging = command(resolve(sdk, "build-tools/36.0.0/aapt2"), ["dump", "badging", apk]);
assert.match(badging, /^application-label:'StockFlow Preview'$/m, "Debug launcher must clearly identify the preview");
assert.equal(getAttribute(application, "android:allowBackup"), "false");
assert.equal(getAttribute(application, "android:usesCleartextTraffic"), "false");
assert.equal(getAttribute(application, "android:debuggable"), "true", "This CI artifact must remain clearly a debug test build");
assert.equal(Number(getAttribute(usesSdk, "android:minSdkVersion")), 26);
assert.equal(Number(getAttribute(usesSdk, "android:targetSdkVersion")), 36);
for (const attribute of ["android:networkSecurityConfig", "android:dataExtractionRules", "android:fullBackupContent"])
  assert.ok(getAttribute(application, attribute)?.startsWith("@"), `${attribute} must reference a compiled resource`);
const permissions = [...manifest.matchAll(/<uses-permission\b[^>]*>/g)].map(([tag]) => getAttribute(tag, "android:name")).sort();
const allowed = new Set(["android.permission.INTERNET", "android.permission.CAMERA", "android.permission.ACCESS_NETWORK_STATE", "android.permission.VIBRATE", "ng.com.stockflow.app.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"]);
for (const permission of permissions) assert.ok(allowed.has(permission), `Review unexpected packaged permission: ${permission}`);
assert.ok(permissions.includes("android.permission.CAMERA"));
assert.ok(permissions.includes("android.permission.INTERNET"));
for (const name of ["android.hardware.camera", "android.hardware.camera.any", "android.hardware.camera.autofocus"]) {
  const feature = [...manifest.matchAll(/<uses-feature\b[^>]*>/g)].map(([tag]) => tag).find((tag) => getAttribute(tag, "android:name") === name);
  assert.equal(getAttribute(feature ?? "", "android:required"), "false", `${name} must remain optional`);
}
const plugins = JSON.parse(command("unzip", ["-p", apk, "assets/capacitor.plugins.json"]));
for (const name of ["@capacitor/app", "@capacitor/barcode-scanner", "@capacitor/share"])
  assert.ok(plugins.some((plugin) => plugin.pkg === name), `${name} missing from APK`);
const signature = command(signer, ["verify", "--print-certs", apk]);
assert.match(signature, /CN=Android Debug/, "Debug CI must not use release credentials");
const bundleFiles = command("unzip", ["-Z1", bundle]);
assert.ok(bundleFiles.includes("base/manifest/AndroidManifest.xml"));
assert.doesNotMatch(bundleFiles, /^META-INF\/[^\n]+\.(?:RSA|DSA|EC)$/m, "This workflow must produce an unsigned release bundle");
command(resolve(sdk, "build-tools/36.0.0/zipalign"), ["-c", "-P", "16", "4", apk]);
const nativeLibraries = command("unzip", ["-Z1", apk]).split("\n").filter((name) => /^lib\/(arm64-v8a|x86_64)\/[^/]+\.so$/.test(name));
const libraryAlignments = [];
const temporary = await mkdtemp(resolve(tmpdir(), "stockflow-elf-"));
try {
  for (const name of nativeLibraries) {
    const path = resolve(temporary, "library.so");
    await writeFile(path, execFileSync("unzip", ["-p", apk, name], { maxBuffer: 50 * 1024 * 1024 }));
    const segments = command("readelf", ["-lW", path]).split("\n").map((line) => line.trim().split(/\s+/)).filter((parts) => parts[0] === "LOAD");
    assert.ok(segments.length, `Expected ELF load segments: ${name}`);
    const minimumAlignment = Math.min(...segments.map((parts) => Number(parts.at(-1))));
    assert.ok(minimumAlignment >= 16384, `64-bit native library must support 16 KB pages: ${name}`);
    libraryAlignments.push({ name, minimum_load_alignment: minimumAlignment });
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const report = {
  checked_at: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  app_id: "ng.com.stockflow.app.preview",
  release_app_id: "ng.com.stockflow.app",
  app_label: "StockFlow Preview",
  backend_environment: "Uses the explicitly configured backend; preview installation is not a data sandbox",
  version: getAttribute(metadata, "android:versionName"),
  build: getAttribute(metadata, "android:versionCode"),
  minimum_sdk: 26,
  target_sdk: 36,
  artifacts: { debug_apk_sha256: createHash("sha256").update(await readFile(apk)).digest("hex"), unsigned_bundle_sha256: createHash("sha256").update(await readFile(bundle)).digest("hex") },
  permissions,
  plugins: plugins.map((plugin) => plugin.pkg),
  native_libraries: libraryAlignments,
  verified: ["separate preview package identity and launcher label", "debug APK signature", "unsigned release bundle", "API 36 manifest", "optional camera", "backup and device-transfer exclusions", "HTTPS-only policy", "native app/scanner/share registration", "16 KB ZIP and 64-bit ELF load alignment"],
  not_verified: ["signed Play release", "physical camera", "Android hardware Back and keyboard/insets", "production backend workflows"],
};
await writeFile(resolve(root, "android-package-verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log("PASS compiled Android package: API 36, bounded permissions, optional camera, backup and transport policy, native plugins, unsigned release bundle");
