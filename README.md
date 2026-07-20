This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## PWA Configuration

This project is configured as a Progressive Web App with:

- `app/manifest.ts` for web app manifest metadata.
- `public/sw.js` as the service worker.
- `app/pwa-register.tsx` to register the service worker in the browser.
- `public/offline.html` as the offline navigation fallback.
- `public/icon-192.png`, `public/icon-512.png`, and `public/apple-touch-icon.png` for install icons.

To test installability locally:

1. Run `npm run build` then `npm run start`.
2. Open `http://localhost:3000` in Chrome.
3. Check **Application > Manifest** and **Service Workers** in DevTools.
4. Use **Lighthouse** with the PWA category to validate requirements.

### Hydration mismatch note during development

If you previously ran the app with the service worker enabled, stale cached assets can cause hydration mismatch errors.

One-time cleanup in the browser console:

```js
await navigator.serviceWorker
  .getRegistrations()
  .then((regs) => Promise.all(regs.map((r) => r.unregister())));
await caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
```

Reload the page after running the cleanup snippet.

## Shadcn-style starter UI scaffold

The home page now renders an operations console style starter UI that is wired to the incident workflow APIs.

- Page entry: `app/page.tsx`
- Workbench screen: `app/gosafety-workbench.tsx`
- UI primitives: `components/ui/*`

Included starter capabilities:

- Create incident form (`POST /api/incidents`)
- Incident queue table (`GET /api/incidents`)
- Workflow action panel for evaluate, assign, resolve, manager confirm, and close
- In-app PWA install button integration

## Database Schema Implementation (PostgreSQL)

The generated GoSafety relational schema is implemented in this app as SQL migrations and seed files.

- Migration SQL: `db/migrations/001_init.sql`
- Seed SQL: `db/seeds/001_seed_reference.sql`
- Migration runner: `scripts/db-migrate.mjs`
- Seed runner: `scripts/db-seed.mjs`
- Server DB client: `lib/server/db.ts`
- Example API endpoints:
  - `app/api/health/db/route.ts`
  - `app/api/incidents/route.ts`
  - `app/api/incidents/[incidentId]/evaluate/route.ts`
  - `app/api/incidents/[incidentId]/assign/route.ts`
  - `app/api/incidents/[incidentId]/resolve/route.ts`
  - `app/api/incidents/[incidentId]/manager-confirm/route.ts`
  - `app/api/incidents/[incidentId]/close/route.ts`

### Setup

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
   The db scripts automatically load `.env.local` (and `.env` as fallback).
2. Run migrations:

```bash
npm run db:migrate
```

3. Seed reference data:

```bash
npm run db:seed
```

Or run both:

```bash
npm run db:setup
```

### Incident workflow write APIs

All workflow endpoints enforce transition validity against `status_transitions`.

- `POST /api/incidents`
  - Creates an incident in `reported` state.
  - Required: `title`, `description`, and exactly one reporter source:
    - `reporterUserId`, or
    - `reporterExternalId`/`externalReporter` details.
- `POST /api/incidents/:incidentId/evaluate`
  - Required: `evaluatorUserId`, `categoryId`, `severityId`.
  - Writes `incident_evaluations` and transitions to `evaluated` (via `under_review` if needed).
- `POST /api/incidents/:incidentId/assign`
  - Required: `assignedTeamId`, `assignedByUserId`.
  - Writes `incident_assignments` and transitions to `assigned`.
- `POST /api/incidents/:incidentId/admin-actions`
  - Unified workflow action endpoint for dashboard actions.
  - Key actions:
    - `mark_resolved` (fulfillment assigned member): moves incident from `assigned` to `in_progress` and records fulfillment resolution event.
    - `manager_confirm_resolved` (department manager): records manager confirmation for in-progress incidents in the assignee's department.
    - `close_out` (admin/evaluator): transitions incident from `in_progress` to `resolved` after manager confirmation.
    - Existing actions: `acknowledge`, `update_details`, `assign_fulfillment`, `assign_sla`, `return_to_admin`.

Legacy endpoints retained for compatibility but deprecated (return HTTP 410):

- `POST /api/incidents/:incidentId/resolve`
- `POST /api/incidents/:incidentId/manager-confirm`
- `POST /api/incidents/:incidentId/close`

### Postman collection (happy path)

- Import [postman/GoSafety-Workflow.postman_collection.json](postman/GoSafety-Workflow.postman_collection.json)
- Import [postman/GoSafety-Local.postman_environment.json](postman/GoSafety-Local.postman_environment.json)
- Fill environment variables with valid UUIDs from your database:
  - `reporterUserId`
  - `evaluatorUserId`
  - `fulfillmentUserId`
  - `managerUserId`
  - `assignedTeamId`
  - `categoryId`
  - `severityId`
  - `siteId` (optional)

Run requests in order. The create request stores `incidentId` and `incidentNo` automatically for downstream steps.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
