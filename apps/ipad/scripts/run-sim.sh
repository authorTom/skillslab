#!/usr/bin/env bash
# Build, install and launch the app on an iPad simulator without Simulator.app.
#
# Xcode's Cmd+R needs Simulator.app to display a run. This drives the same
# build through simctl instead and writes a screenshot, which also makes it
# usable over SSH or in CI.
#
#   ./scripts/run-sim.sh                      # build, run, screenshot
#   ./scripts/run-sim.sh --device "iPad (A16)"
#   ./scripts/run-sim.sh --no-build           # relaunch what is installed
#   ./scripts/run-sim.sh --shot out.png
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE="iPad Pro 11-inch (M5)"
APP_ID="uk.nhs.skillslab"
BUILD=1
SHOT="${TMPDIR:-/tmp}/skillslab-sim.png"
DERIVED="${TMPDIR:-/tmp}/skillslab-derived"

while [ $# -gt 0 ]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    --shot) SHOT="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

# Xcode's CLI tools are only found via DEVELOPER_DIR unless xcode-select has
# been pointed at Xcode.app (sudo xcode-select -s /Applications/Xcode.app/Contents/Developer).
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

UDID=$(xcrun simctl list devices available \
  | grep -F "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
if [ -z "$UDID" ]; then
  echo "No available simulator named '$DEVICE'." >&2
  echo "Available iPads:" >&2
  xcrun simctl list devices available | grep -i ipad >&2
  exit 1
fi
echo "==> $DEVICE  ($UDID)"

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" >/dev/null 2>&1 || true

if [ "$BUILD" -eq 1 ]; then
  echo "==> building web layer"
  npm run build
  echo "==> cap sync ios"
  npx cap sync ios
  echo "==> xcodebuild (this can take a few minutes on a clean build)"
  xcodebuild -project ios/App/App.xcodeproj -scheme App \
    -sdk iphonesimulator -configuration Debug \
    -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO build \
    | tail -5
fi

APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
if [ ! -d "$APP" ]; then
  echo "No build at $APP — run without --no-build first." >&2
  exit 1
fi

echo "==> installing"
xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"

echo "==> launching"
xcrun simctl launch "$UDID" "$APP_ID"

# Let the webview paint before capturing.
for _ in $(seq 1 12); do xcrun simctl spawn "$UDID" log show --last 1s >/dev/null 2>&1; done

if xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -q "$APP_ID"; then
  echo "==> running"
else
  echo "==> WARNING: process is not running — it exited or crashed" >&2
fi

xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null 2>&1
echo "==> screenshot: $SHOT"
