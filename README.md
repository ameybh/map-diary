# Map Diary MVP

Next.js + TypeScript local-first PWA for saving private map memories with notes, photos, friends, shared mates, and a common feed.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Stack

- Next.js app router, React, TypeScript.
- Tailwind CSS v4 with `DESIGN.md` tokens mapped in `app/globals.css`.
- shadcn-style local primitives in `components/ui`.
- Leaflet + React Leaflet with a clean CARTO basemap.
- Lucide icons for app controls.
- IndexedDB for local state and photo data URLs.
- Service worker + web manifest for PWA install/offline shell.

## MVP scope

- Responsive desktop and mobile web app.
- Interactive world map with clickable locations and saved markers.
- Entry editor with notes, privacy, mates, and image uploads.
- Scrapbook, feed, friends, and account settings pages.
- Friend search, follow/feed visibility, shared mate entries.
- Local-first sync status with a local remote mirror in `localStorage`.

## Cloud adapter

The MVP runs with `settings.syncMode = "local-mirror"` by default. The sync path is isolated in `mirrorToCloud()` in `lib/local-store.ts`; if `settings.cloudEndpoint` is set in state, the app sends the snapshot with `PUT` to that endpoint. A production backend can replace the local mirror without changing the UI or IndexedDB data model.
