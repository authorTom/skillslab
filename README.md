# Clinical Skills

A clean, fast, responsive web app for delivering procedural clinical skills educational
materials — PDFs, images, step-by-step storyboards and embedded Vimeo videos. Learners pick a
skill and review its resources before, during or after the clinical skills lab; administrators
manage courses through a simple admin section.

## Stack

- **Next.js** (App Router, TypeScript, React Server Components + Server Actions)
- **Tailwind CSS** for a minimalist, fully responsive UI (desktop / tablet / mobile)
- **SQLite** (`better-sqlite3`) — zero-setup local database stored in `data/app.db`
- Uploaded files stored in `data/uploads/` and served via `/files/…`

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The database is created and seeded with example skills on first
run — replace them with your own content via the admin section.

### Admin section

Go to **/admin** (also linked in the header). The password is set in `.env.local`:

```
ADMIN_PASSWORD=clinical-admin   # change this before deploying
```

From the admin section you can:

- add, edit and remove skills (courses), including an optional card thumbnail
- upload PDFs and images
- build storyboards from multiple images with a caption per step (shown to learners as a
  step-through sequence)
- attach Vimeo videos by pasting the video URL (private links with a hash are supported)
- reorder the resources shown for each skill

Uploads through the admin section are limited to 50 MB per submission (configured via
`experimental.serverActions.bodySizeLimit` in `next.config.ts`).

### Production

```bash
npm run build
npm start
```

### Backups

Everything lives in `data/` (SQLite database + uploaded files). To snapshot it into
`backups/<timestamp>/` — safe to run while the app is serving:

```bash
npm run backup
```

The 14 most recent snapshots are kept. To run nightly at 02:00 via cron:

```
0 2 * * * cd /path/to/clinical-skills && /usr/local/bin/npm run backup
```

## Project layout

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Skill catalogue with search and category filters |
| `src/app/skills/[slug]/page.tsx` | Skill detail page with the resource viewer |
| `src/components/ResourceViewer.tsx` | PDF viewer, image lightbox, storyboard stepper, Vimeo embed |
| `src/app/admin/` | Admin section: login, course list, skill editor |
| `src/app/admin/actions.ts` | Server actions: auth, skill CRUD, uploads |
| `src/app/files/[...path]/route.ts` | Serves uploaded files from `data/uploads` |
| `src/lib/db.ts` | SQLite schema + first-run seed data |
| `src/lib/data.ts` | Typed query/CRUD helpers |
| `data/` | Database and uploads (git-ignored — back this up) |
