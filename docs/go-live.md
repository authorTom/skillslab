# Going live

The steps from a source checkout to iPads in use, in the order they depend on
each other. Each step links to the detail elsewhere. The server comes first,
because its signing key is built into the iPad app.

Start [step 4](#4-apple-accounts) on day one: Apple's organisation
enrolment can take one to two weeks, and everything else can happen while you
wait.

## 1. Publish a server release

1. Merge the open pull requests into `main` and check CI passes.
2. Tag the release and push the tag:

   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```

   The *Publish Docker image* workflow builds `ghcr.io/authortom/skillslab:1.0.0`.
   Wait for it to finish, then check the image exists:

   ```bash
   docker pull ghcr.io/authortom/skillslab:1.0.0
   ```

   `compose.yaml` only runs tagged versions, so without a tag there is nothing
   to deploy.

## 2. Stand up the server

Follow [Internal deployment with HTTPS](../README.md#internal-deployment-with-https)
in the README. In short, on the server:

1. Copy `compose.yaml` and `.env.example` (as `.env`), and set
   `SKILLSLAB_VERSION=1.0.0` and `SKILLSLAB_HOSTNAME`.
2. **Certificate:** prefer one from your organisation's CA
   (`SKILLSLAB_TLS=/certs/… /certs/…`). Managed iPads usually trust it already,
   and it doesn't depend on Caddy's data volume surviving.
3. **Signing key:** generate it ([Release signing](../README.md#release-signing)),
   set `RELEASE_SIGNING_KEY_FILE`, and **put a copy somewhere safe and
   offline now**. It isn't in the backups, and losing it means rebuilding the
   iPad app.
4. **Backups:** set `SKILLSLAB_BACKUP_PATH` to storage off this server (a
   mounted network share), and `TZ` if 02:00 UTC is the wrong time.
5. `docker compose up -d`, then `docker compose logs app` for the setup code.
   Create the administrator, then an account for each editor.

Check:

- [ ] `https://<hostname>/api/health` says `ok`.
- [ ] **/admin/releases** says signing is on. Copy the public key.
- [ ] `docker compose logs backups` shows when the next backup is due. After
      the first night, there's a snapshot in the backup folder.
- [ ] An uptime monitor watches `/api/health`.
- [ ] The server isn't reachable from the internet. The learner pages, files
      and the iPads' release API need no sign-in by design.

## 3. Get the content ready

1. Add the courses, skills and media.
2. Upload every video as an MP4. Vimeo videos can't play offline, and a
   release built with the default *strict* Vimeo policy lists any that remain.
3. Build a release on **/admin/releases**. It is signed and becomes current.
4. Build a small **demo release** for App Review too, from a few skills with
   uploaded videos, and *Download package* to get its `.skillslab` file. (Or
   build it from the real content and use that.)

## 4. Apple accounts

- [ ] An **Apple Developer Program** membership for the organisation (needs a
      D-U-N-S number). A personal team can't submit.
- [ ] The organisation's **Apple Business Manager** account and its
      Organisation ID (*Preferences › Enrolment information*).
- [ ] The organisation's team ID in place of `X97G245HKP` in
      `apps/ipad/ios/App/App.xcodeproj/project.pbxproj` and both files in
      `apps/ipad/ios/export/`.

## 5. Build and test the iPad app

Details are in the [iPad distribution guide](ipad-distribution.md).

1. In `apps/ipad/.env.production.local`, set `VITE_SIGNING_PUBLIC_KEY` to the
   key from step 2 and `VITE_SERVER_URL` to the server's address.
2. Create the app record in App Store Connect and make it **private** to your
   organisation ([Route B](ipad-distribution.md#route-b-apple-business-manager-custom-app),
   steps 1–2).
3. `node scripts/set-version.mjs 1.0.0`, then `./scripts/archive.sh abm`, and
   upload `build/abm/App.ipa` with Transporter.
4. Install it on two or three iPads with **TestFlight** (internal testing needs
   no review), with the same MDM configuration and certificate profile the
   fleet will get. On a real iPad, check:
   - [ ] *Get content* downloads the release; the iPad then works in flight
         mode, including after force-quitting the app.
   - [ ] Videos play, PDFs and storyboards open.
   - [ ] A newer release shows *New content available* on the home screen
         and installs; *Roll back* restores the old one.
   - [ ] A `.skillslab` file from AirDrop or Files installs.
   - [ ] With an admin PIN set, Settings and Content updates ask for it.
   - [ ] Every screen still works in portrait and in a resized window. iPadOS
         lets people resize apps into windows, which can override the
         landscape lock.

## 6. Submit for review

In App Store Connect, fill in:

- **Screenshots:** 13-inch iPad, taken from the simulator or a TestFlight build.
- **Description**, **support URL** and **privacy policy URL** (required even
  though no data is collected).
- **App Privacy:** *Data Not Collected*.
- **Age rating:** answer *Medical/Treatment Information* as infrequent.
- **Category:** Medical or Education.
- **App Review Information:** attach the demo `.skillslab` file, and paste
  notes like these:

  > SkillsLab is an offline library of clinical-skills training content
  > (videos, step-by-step storyboards, PDFs) for staff and students at
  > \[organisation]. It is distributed privately through Apple Business
  > Manager. Content comes from the organisation's own server on its internal
  > network, which the review team can't reach, so a demo content package is
  > attached.
  >
  > To try it: save the attached .skillslab file to Files on the iPad. In the
  > app, tap *Get content*, then under *Install from a file* tap *Choose
  > package…* and pick the file. Or open it from Files or AirDrop, which
  > opens SkillsLab. Once installed, everything
  > works offline.
  >
  > No account is needed and the app collects no data. Packages must carry
  > the organisation's signature, so only content from its server can be
  > installed. *Settings* is for the organisation's administrators.

  Add the admin PIN to the notes if the build has one set (a fresh install
  has none).

Then choose the build and *Submit for Review*.

## 7. Roll out

1. Once approved, get licences in Apple Business Manager (*Apps and Books ›
   Custom Apps*) and assign them to your MDM's location.
2. In the MDM, deploy the app as **device-assigned**, with the managed app
   configuration (`serverUrl`, `signingPublicKey`) and a certificate payload
   if the server's CA needs one
   ([Managed app configuration](ipad-distribution.md#managed-app-configuration)).
3. On one iPad, check *Settings › Manage updates* shows the server and key as
   *Set by your organisation’s device management*, then *Get content*.

## After launch

- **Content changes** reach iPads only after someone builds a release on
  **/admin/releases**. iPads check every four hours while open, and show *New
  content available*.
- **App updates:** raise the version and build number, archive, upload,
  submit. The MDM updates the iPads once Apple approves.
- **Server updates:** follow [Upgrading](../README.md#upgrading).
- **Each year:** renew the Apple Developer membership, and the server
  certificate before it expires (at most 398 days for iPads to accept it).
- **Restore test:** restore a backup onto a spare machine now and then
  ([Restoring](../README.md#restoring)), so the first restore isn't during an
  outage.
