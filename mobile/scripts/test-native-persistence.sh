#!/usr/bin/env bash
set -euo pipefail

# Runs only app-owned tests with synthetic records in an isolated preview package.
# The generated Capacitor example test assumes a different package and is excluded.
cd "$(dirname "$0")/../android"
chmod +x gradlew
./gradlew :app:connectedDebugAndroidTest --no-daemon \
  -Pandroid.testInstrumentationRunnerArguments.class=ng.com.stockflow.app.SecurePendingStoreInstrumentedTest

# AGP may uninstall instrumentation packages after connected tests; explicitly
# install the exact built pair for the separate process-restart checks.
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

mkdir -p app/build/reports/stockflow-persistence
run_process_test() {
  local method="$1"
  local output="app/build/reports/stockflow-persistence/${method}.txt"
  adb shell am instrument -w -r \
    -e class "ng.com.stockflow.app.SecurePendingProcessInstrumentedTest#${method}" \
    ng.com.stockflow.app.preview.test/androidx.test.runner.AndroidJUnitRunner > "$output"
  cat "$output"
  # am instrument can exit zero even when a test assertion fails.
  python3 - "$output" <<'PY'
import pathlib, sys
result = pathlib.Path(sys.argv[1]).read_text()
assert "OK (1 test)" in result and "FAILURES" not in result and "INSTRUMENTATION_FAILED" not in result, result
PY
}

run_process_test seedBeforeProcessDeath
adb shell am force-stop ng.com.stockflow.app.preview
run_process_test restoreAfterProcessDeath
