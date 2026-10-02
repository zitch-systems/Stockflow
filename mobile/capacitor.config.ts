import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS of stockflow.com.ng
  appId: 'ng.com.stockflow.app',
  appName: 'StockFlow',
  webDir: 'out',
  backgroundColor: '#f4f7f5',
  // Capacitor debug logs include plugin arguments; pending intents contain business data.
  loggingBehavior: 'none',
  android: {
    // Capacitor 7 defaults to disabled; protect actions from Android 15+ system bars.
    adjustMarginsForEdgeToEdge: 'auto',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
    // Keep bundled pages inside the app. External links use the system browser.
    allowNavigation: [],
  },
};

export default config;
