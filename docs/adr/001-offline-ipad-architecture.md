# ADR-001: Authoring CMS and offline iPad reader split

## Status

Accepted

## Context

SkillsLab is a clinical-skills content library used in simulation education. Learners browse courses containing PDFs, images, storyboards and videos. The existing web application (Next.js, SQLite, Server Actions) serves as both the authoring tool and the learner-facing reader.

The target deployment includes iPads that must remain fully usable offline, including after cold launch with no network. Vimeo videos cannot play without internet, and the authoring database contains admin state (trash, folders, tags) that learners do not need.

## Decision

Split the system into three parts:

1. **Web CMS (existing Next.js app)** remains the authoring system. Administrators create and manage content here. No changes to its core behaviour.

2. **Content export pipeline** added to the web app. Produces immutable, versioned content packages containing a read-only SQLite catalogue and content-addressed media assets. A small release API allows efficient update checks.

3. **iPad reader app (Capacitor + React + Vite)** in a separate `apps/ipad/` directory. Bundles a static web shell, stores catalogue data in native SQLite and media in the iOS filesystem. Checks for updates when online but never requires connectivity to browse installed content.

## Key design choices

- The offline catalogue schema is separate from the authoring schema: read-only, normalised storyboard frames, no trash or admin state.
- Content packages are self-contained ZIP archives with a JSON manifest, SHA-256 checksums for every asset, and a versioned format identifier.
- Local video (MP4/H.264/AAC) is a first-class media kind alongside image and PDF. Vimeo remains supported in the web app but an offline release must not silently depend on it.
- The iPad app imports packages through a single validated pipeline whether the source is an online download, a bundled starter package, or a manual Files/AirDrop import.
- Atomic activation: the new release becomes active only after full validation. The previous known-good release is retained for rollback.

## Consequences

- Administrators must build and publish a release before learners see changes on iPads.
- Video files must be uploaded as local MP4s for offline use; Vimeo-only content is flagged or blocked at export time.
- The iPad app binary must be signed and distributed through Apple's mechanisms (App Store, Custom Apps, or Ad Hoc).
- The content package format is versioned; forward-only schema migrations in the reader app handle upgrades.
