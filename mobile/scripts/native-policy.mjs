// Android policy is generated after cap sync so clean builds have the same protections.
// Keep these functions free of filesystem side effects for regression checks.
export function setAttribute(tag, name, value) {
  const expression = new RegExp(`\\s${name}="[^"]*"`);
  if (expression.test(tag)) return tag.replace(expression, ` ${name}="${value}"`);
  return tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
}

export function configureAndroidManifest(source) {
  if (!/<application\b/.test(source) || !/<\/manifest>/.test(source))
    throw new Error("The generated Android manifest is not recognised; review before packaging.");
  let result = source.replace(/<manifest\b[^>]*>/, (tag) => setAttribute(tag, "xmlns:tools", "http://schemas.android.com/tools"));
  result = result.replace(/<application\b[^>]*>/, (tag) => {
    for (const [name, value] of Object.entries({
      "android:allowBackup": "false",
      "android:fullBackupContent": "@xml/stockflow_backup_rules",
      "android:dataExtractionRules": "@xml/stockflow_data_extraction_rules",
      "android:usesCleartextTraffic": "false",
      "android:networkSecurityConfig": "@xml/stockflow_network_security",
    })) tag = setAttribute(tag, name, value);
    return tag;
  });
  result = result.replace(/<activity\b[^>]*android:name="(?:\.MainActivity|ng\.com\.stockflow\.app\.MainActivity)"[^>]*>/,
    (tag) => setAttribute(tag, "android:windowSoftInputMode", "adjustResize"));
  if (!result.includes('android:name="android.permission.CAMERA"'))
    result = result.replace("</manifest>", '    <uses-permission android:name="android.permission.CAMERA" />\n</manifest>');
  // SKU search works without a camera; CAMERA otherwise implies mandatory rear-camera/autofocus hardware.
  for (const feature of ["android.hardware.camera", "android.hardware.camera.any", "android.hardware.camera.autofocus"]) {
    const matcher = new RegExp(`<uses-feature\\b[^>]*android:name="${feature.replaceAll(".", "\\.")}"[^>]*\\/?>`);
    // required uses an OR merge; replace prevents a camera SDK from silently making hardware mandatory.
    if (matcher.test(result)) result = result.replace(matcher, (tag) => setAttribute(setAttribute(tag, "android:required", "false"), "tools:node", "replace"));
    else result = result.replace("</manifest>", `    <uses-feature android:name="${feature}" android:required="false" tools:node="replace" />\n</manifest>`);
  }
  return result;
}

export function configureAndroidStyles(source) {
  const themes = {
    AppTheme: { colorPrimary: "#127d5c", colorPrimaryDark: "#0b4f3c", colorAccent: "#127d5c" },
    "AppTheme.NoActionBar": {
      "android:statusBarColor": "#f4f7f5", "android:navigationBarColor": "#f4f7f5",
      "android:windowLightStatusBar": "true", "android:windowLightNavigationBar": "true",
    },
    "AppTheme.NoActionBarLaunch": {
      windowSplashScreenBackground: "#127d5c",
      windowSplashScreenAnimatedIcon: "@mipmap/ic_launcher_foreground",
      postSplashScreenTheme: "@style/AppTheme.NoActionBar",
    },
  };
  let result = source;
  for (const [theme, items] of Object.entries(themes)) {
    const matcher = new RegExp(`(<style\\b[^>]*name="${theme.replaceAll(".", "\\.")}"[^>]*>)([\\s\\S]*?)(<\\/style>)`);
    if (!matcher.test(result)) throw new Error(`Missing generated theme ${theme}; review native styling.`);
    result = result.replace(matcher, (_, open, content, close) => {
      for (const [name, value] of Object.entries(items)) {
        const itemMatcher = new RegExp(`<item name="${name}">[^<]*<\\/item>`);
        const item = `<item name="${name}">${value}</item>`;
        content = itemMatcher.test(content) ? content.replace(itemMatcher, item) : `${content.trimEnd()}\n        ${item}\n    `;
      }
      return open + content + close;
    });
  }
  return result;
}

export function configureAndroidBuildVariants(source) {
  if (!/applicationId\s+["']ng\.com\.stockflow\.app["']/.test(source))
    throw new Error("Review the release application ID before configuring a separate preview install.");
  const block = `// STOCKFLOW_PREVIEW_BEGIN
// Preview installs alongside StockFlow; it still uses the explicitly configured backend.
android.buildTypes.debug {
    applicationIdSuffix ".preview"
    versionNameSuffix "-preview"
}
// STOCKFLOW_PREVIEW_END`;
  const previous = /\/\/ STOCKFLOW_PREVIEW_BEGIN[\s\S]*?\/\/ STOCKFLOW_PREVIEW_END/;
  return previous.test(source) ? source.replace(previous, block) : source.trimEnd() + "\n\n" + block + "\n";
}

export const androidPreviewStrings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">StockFlow Preview</string>
  <string name="title_activity_main">StockFlow Preview</string>
</resources>
`;

const backupDomains = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"];
const exclusions = backupDomains.map((domain) => `    <exclude domain="${domain}" path="." />`).join("\n");
export const androidResources = {
  // Text receipt sharing needs no file access. Keep a narrow cache-only path for
  // explicitly generated receipts; do not inherit the template's external root.
  "file_paths.xml": `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="stockflow_receipts" path="receipts/" />
</paths>
`,
  "stockflow_network_security.xml": `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors><certificates src="system" /></trust-anchors>
  </base-config>
</network-security-config>
`,
  "stockflow_backup_rules.xml": `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${exclusions}
</full-backup-content>
`,
  "stockflow_data_extraction_rules.xml": `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${exclusions}
  </cloud-backup>
  <device-transfer>
${exclusions}
  </device-transfer>
</data-extraction-rules>
`,
};
