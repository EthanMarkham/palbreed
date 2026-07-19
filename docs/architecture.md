# Architecture decision: Vite, not Next.js

This project is a client-side calculator whose public production data is a versioned static artifact. Vite is the deliberate deployment target: it builds a small static site that Vercel can serve from its CDN without a server runtime, data fetch, or database connection.

Migrating to Next.js is not inherently a bad refactor, but it would add routing, server/runtime, and dependency complexity without solving a current product requirement. A Next.js migration should occur only when the product needs dynamic server-rendered public pages or a substantial server-only backend-for-frontend.

## Current boundary

- React components access Pals only through `breedingRepository`.
- The lineage service is a pure client-side algorithm.
- Pal Builder runs its pure solver in a browser Web Worker.
- The compact generated matrix is the production read path; the full canonical artifact remains an audit and release-validation asset.

## Future migration path

If Next.js is required later, move `domain`, `data`, and `services` unchanged into the app, render the existing planner as a client component, and keep generated data out of server-only code. Do not migrate only for Vercel deployment: Vercel supports Vite static deployments directly.
