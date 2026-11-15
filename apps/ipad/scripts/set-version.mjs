#!/usr/bin/env node
// Sets the app's version before an archive.
//
//   node scripts/set-version.mjs 1.2.0          version 1.2.0, next build number
//   node scripts/set-version.mjs 1.2.0 42       version 1.2.0, build 42
//   node scripts/set-version.mjs --show         print the current values
//
// The marketing version (CFBundleShortVersionString) is what people see; the
// build number (CFBundleVersion) must go up with every build you upload to App
// Store Connect or hand out, even when the version stays the same. Both are
// written to the Xcode project (MARKETING_VERSION, CURRENT_PROJECT_VERSION),
// and the version to package.json, which the Settings page shows when the app
// runs in a browser.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectFile = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
const packageFile = path.join(root, "package.json");

const project = fs.readFileSync(projectFile, "utf8");
const current = {
  version: project.match(/MARKETING_VERSION = ([^;]+);/)?.[1],
  build: project.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)?.[1],
};

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: node scripts/set-version.mjs <version> [build] | --show");
  process.exit(args.length === 0 ? 1 : 0);
}
if (args[0] === "--show") {
  console.log(`version ${current.version}, build ${current.build}`);
  process.exit(0);
}

const [version, buildArg] = args;
// App Store Connect accepts up to three period-separated integers for both.
const NUMBERS = /^\d+(\.\d+){0,2}$/;
if (!NUMBERS.test(version)) {
  console.error(`"${version}" isn't a version: use one to three numbers, like 1.2.0.`);
  process.exit(1);
}
let build = buildArg;
if (build === undefined) {
  const last = Number(current.build);
  if (!Number.isInteger(last)) {
    console.error(`The current build number "${current.build}" isn't a whole number; give one explicitly.`);
    process.exit(1);
  }
  build = String(last + 1);
}
if (!NUMBERS.test(build)) {
  console.error(`"${build}" isn't a build number: use one to three numbers, like 42.`);
  process.exit(1);
}

fs.writeFileSync(
  projectFile,
  project
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`)
);

const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
pkg.version = version.split(".").length === 3 ? version : `${version}${".0".repeat(3 - version.split(".").length)}`;
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Version ${current.version} (${current.build}) → ${version} (${build})`);
