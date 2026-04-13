# Desktop Packaging

This project uses an Electron wrapper for desktop packaging because the app depends on:

- server-side Next.js route handlers
- a writable SQLite database
- local file imports and generated data

The packaging flow is:

1. `npm run desktop:build:web`
2. `electron-builder install-app-deps`
3. `electron-builder`

`scripts/prepare-desktop.mjs` copies the desktop entrypoints plus static assets into `.next/standalone`, and Electron packages that standalone bundle as the distributable app.
