#!/usr/bin/env bash
# Archives the app for distribution and exports an .ipa.
#
#   ./scripts/archive.sh adhoc    ad hoc: installs on registered iPads only
#   ./scripts/archive.sh abm      App Store Connect, for an Apple Business
#                                 Manager custom app
#
# Set the build-time defaults first, in the environment or in
# .env.production.local (git-ignored):
#   VITE_SIGNING_PUBLIC_KEY   required: the key shown on the server's
#                             /admin/releases page
#   VITE_SERVER_URL           optional: https:// address of the server
# The web build refuses to run without a signing key (see
# scripts/release-defaults.mjs). Set the version first with
# scripts/set-version.mjs.
#
# Output: build/SkillsLab.xcarchive and build/<route>/App.ipa.
# See docs/ipad-distribution.md for the whole procedure.
set -euo pipefail

cd "$(dirname "$0")/.."

ROUTE="${1:-}"
case "$ROUTE" in
  adhoc) OPTIONS=ios/export/ExportOptions-AdHoc.plist ;;
  abm)   OPTIONS=ios/export/ExportOptions-AppStoreConnect.plist ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac

if [ -n "${SKILLSLAB_ALLOW_UNSIGNED_BUILD:-}" ]; then
  echo "SKILLSLAB_ALLOW_UNSIGNED_BUILD is set. A distributed build must enforce signatures;" >&2
  echo "unset it, or archive by hand if every iPad really gets its key from an MDM." >&2
  exit 1
fi

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

ARCHIVE=build/SkillsLab.xcarchive
EXPORT="build/$ROUTE"
rm -rf "$ARCHIVE" "$EXPORT"

echo "==> version: $(node scripts/set-version.mjs --show)"
echo "==> building web layer (checks the built-in signing key)"
npm run build
echo "==> cap sync ios"
npx cap sync ios

echo "==> archiving"
xcodebuild archive \
  -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  | tail -3

echo "==> exporting ($ROUTE)"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OPTIONS" \
  -exportPath "$EXPORT" \
  -allowProvisioningUpdates \
  | tail -3

echo "==> done: $(ls "$EXPORT"/*.ipa)"
