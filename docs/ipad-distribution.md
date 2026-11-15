# Distributing the iPad app

The SkillsLab iPad app is not on the public App Store. There are two ways to
get it onto your iPads:

| | **Ad hoc** | **Apple Business Manager custom app** |
| --- | --- | --- |
| Best for | A small number of iPads, or a pilot | A fleet of MDM-managed iPads |
| Devices | Each iPad registered by UDID; at most 100 iPads per membership year | Any iPad your MDM manages; no registration |
| Apple review | None | Yes, App Review for each version |
| Installing | Apple Configurator, Finder, or your MDM | Your MDM pushes it, silently |
| Expiry | The provisioning profile lasts a year; reinstall a re-signed build before then | None |
| Managed configuration | Only on iPads that are also MDM-enrolled | Yes |

Both start from the same archive. Read [Before you start](#before-you-start),
then follow the route you chose.

## Before you start

### An Apple Developer Program membership for the organisation

Both routes need a paid **Apple Developer Program** membership, enrolled as an
organisation (with a D-U-N-S number), not an individual. The custom app route
also needs the organisation's **Apple Business Manager** account, and its
Organisation ID (in Apple Business Manager, under *Preferences › Enrolment
information*).

A free personal team (as used for development so far, team `X97G245HKP`) can
install builds on a developer's own devices for seven days at a time, and can't
do either route.

### Set the team and bundle identifier

The app's bundle identifier is **`uk.skillslab.app`**. Register it as an App ID
in the developer account (*Certificates, Identifiers & Profiles › Identifiers*),
or let Xcode do it with automatic signing.

The project and both export option files name team `X97G245HKP`. To sign with
the organisation's team, replace that ID with yours in:

- `apps/ipad/ios/App/App.xcodeproj/project.pbxproj` (`DEVELOPMENT_TEAM`, two
  places), or in Xcode under *App target › Signing & Capabilities › Team*;
- `apps/ipad/ios/export/ExportOptions-AdHoc.plist` and
  `ExportOptions-AppStoreConnect.plist` (`teamID`).

The Mac doing the archive needs an Apple Distribution certificate for the
team, which Xcode creates under *Settings › Accounts › Manage Certificates*.

### Know the server's address and signing key

- **Signing public key**: open **/admin/releases** on the SkillsLab server
  and copy the public key (see *Release signing* in the README). Every build
  you distribute must have it, so that iPads accept only content signed by
  your server.
- **Server address**: the `https://` address of the server, for example
  `https://skillslab.trust.internal`.

## Build the archive

All commands run in `apps/ipad`.

### 1. Bake in the defaults

Put the key, and optionally the server address, in
`apps/ipad/.env.production.local` (git-ignored):

```bash
VITE_SIGNING_PUBLIC_KEY=unmD2Qhvxr7ymKPvI0V/+HBIMfo5cWyyJtMN+v/bO0Q=
VITE_SERVER_URL=https://skillslab.trust.internal
```

The app uses these unless an MDM's managed configuration overrides them (see
[below](#managed-app-configuration)), and shows them read-only; the signing key
can't be removed on the iPad. With a built-in server address nobody has to type
anything on an unmanaged iPad.

A release build **refuses to run without `VITE_SIGNING_PUBLIC_KEY`**, because
the app would then accept unsigned packages on any iPad not given a key by an
MDM. If every iPad really will get the key from an MDM, you can build with
`SKILLSLAB_ALLOW_UNSIGNED_BUILD=1`, but `archive.sh` refuses that; archive by
hand in that case.

### 2. Set the version

```bash
node scripts/set-version.mjs 1.0.0        # version 1.0.0, next build number
node scripts/set-version.mjs 1.0.0 12     # or an explicit build number
```

The build number must go up with every build you hand out or upload, even if
the version doesn't change. The version shows in the app under *Settings ›
About*.

### 3. Archive and export

```bash
./scripts/archive.sh adhoc    # ad hoc
./scripts/archive.sh abm      # App Store Connect, for Apple Business Manager
```

The script builds the web layer (checking the key), syncs it into the Xcode
project, archives a Release build and exports it to `build/adhoc/App.ipa` or
`build/abm/App.ipa`. The archive stays in `build/SkillsLab.xcarchive`; keep it,
as its debug symbols make crash reports readable.

## Route A: ad hoc

1. **Register each iPad.** Collect each iPad's UDID: connect it to a Mac and
   click the serial number under *Finder › the iPad*, or export it from Apple
   Configurator or your MDM's inventory. Add them in the developer account
   under *Devices* (*Register Multiple Devices* takes a file).
   - The limit is **100 iPads per membership year**. Removing an iPad doesn't
     free its slot until the membership renews, when you can prune the list.
2. **Archive and export** with `./scripts/archive.sh adhoc`. Automatic
   signing creates an ad hoc provisioning profile containing every registered
   iPad. After registering more iPads, export again: the profile is part of
   the app, and an iPad not in it can't install it.
3. **Install** the `.ipa`:
   - Apple Configurator 2: connect the iPads, then drag `App.ipa` onto them;
   - Finder: drag `App.ipa` onto the connected iPad;
   - an MDM: upload it as an in-house or custom `.ipa` app and assign it.
4. **Renew yearly.** The ad hoc profile and the distribution certificate are
   valid for a year. The app stops opening when they expire, so archive,
   export and reinstall before then (the profile's expiry date shows in the
   developer account under *Profiles*). Installed content is kept.

## Route B: Apple Business Manager custom app

1. **Create the app record.** In App Store Connect, *Apps › + › New App*:
   platform iOS, name SkillsLab (or your organisation's name for it), bundle
   ID `uk.skillslab.app`, and a SKU of your choosing.
2. **Make it private.** Under *Pricing and Availability › App Distribution
   Methods*, choose **Private distribution on Apple Business Manager**, and add
   your organisation by its Organisation ID. This can't be changed to public
   later.
3. **Fill in the details** App Review needs:
   - *App Privacy*: **Data Not Collected**. The app sends nothing about its
     users anywhere; it only downloads content from your server.
   - Screenshots for iPad, a description and a support URL.
   - *App Review Information*: say the app needs a SkillsLab server on the
     organisation's network, and that reviewers can install a demo package
     from a file. Attach a signed `.skillslab` package from
     **/admin/releases** (*Download package*), built from demo content, so
     they can try it without network access.
   - *Export compliance*: the app uses HTTPS and verifies signatures, which
     counts as exempt encryption. Answer the questions when you upload, or add
     `ITSAppUsesNonExemptEncryption` = `NO` to `Info.plist` once your
     organisation has confirmed that's the right answer.
4. **Upload.** Export with `./scripts/archive.sh abm`, then send
   `build/abm/App.ipa` with Apple's Transporter app. (Or set `destination` to
   `upload` in `ExportOptions-AppStoreConnect.plist` and the script uploads it
   itself.) Then choose the build for the version and *Submit for Review*.
5. **Get the licences.** Once approved, the app appears in Apple Business
   Manager under *Apps and Books › Custom Apps*. "Buy" as many licences as you
   need (they're free) and assign them to the location your MDM uses.
6. **Deploy from the MDM.** The app syncs into the MDM's app catalogue. Deploy
   it to your iPads as a **device-assigned** app, so no Apple Account is
   needed, and add the managed configuration below.
7. **Updates.** Raise the version and build number, archive, upload and submit
   again. When it's approved the MDM updates the iPads.

## Managed app configuration

An MDM can set the server address and signing key on every managed iPad, so
nobody types them in. Add this as the app's **managed app configuration**
(called *App Configuration* or *App config* in most MDMs):

| Key | Type | Value |
| --- | --- | --- |
| `serverUrl` | String | The server's `https://` address |
| `signingPublicKey` | String | The public key from **/admin/releases** |

As an XML plist, for MDMs that take one:

```xml
<dict>
  <key>serverUrl</key>
  <string>https://skillslab.trust.internal</string>
  <key>signingPublicKey</key>
  <string>unmD2Qhvxr7ymKPvI0V/+HBIMfo5cWyyJtMN+v/bO0Q=</string>
</dict>
```

Managed configuration takes priority over the defaults built into the app,
which take priority over anything entered on the iPad. The app reads it at
launch and whenever it returns to the foreground, so a change takes effect the
next time someone switches back to it. On the iPad, *Settings › Manage
updates* shows each value read-only with where it came from, and the signing
key can't be cleared there.

If you change the server's signing key, update `signingPublicKey` before
publishing a release signed with the new key, or the iPads will refuse it.

## Trusting the server's certificate

The iPads must trust whichever certificate authority issued the server's HTTPS
certificate: your organisation's internal CA, or Caddy's internal CA (see
*Internal deployment with HTTPS* in the README). Until they do, *Check for
updates* says the iPad doesn't trust the server's certificate.

- **Managed iPads:** add the CA's root certificate to a configuration profile
  as a *Certificate* payload and assign it with the app. Profiles installed by
  an MDM are fully trusted automatically.
- **Unmanaged iPads (ad hoc):** AirDrop or email the root certificate (`.crt`)
  to the iPad, install it under *Settings › General › VPN & Device
  Management*, then turn on full trust for it under *Settings › General ›
  About › Certificate Trust Settings*. Both steps are needed.

The app only connects over HTTPS: it won't save an `http://` address.

## Checking an iPad

- *Settings › About › Version* shows the app's version and build number.
- *Settings › Manage updates* shows the server address and signing key in use
  and where each came from, and *Check for updates* tests the connection.
- Packages that weren't signed by your server's key are refused, whether
  downloaded or installed from a file.
