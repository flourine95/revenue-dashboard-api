# Revenue Dashboard API

Express 5 + TypeScript (ESM) REST API. PostgreSQL through Prisma ORM 7. Admin auth via server-side sessions.

## Commands

- Install: `pnpm install`
- Start local DB: `pnpm db:up` — Docker Compose, postgres:17 on port 5432
- Fresh setup: `pnpm db:setup` (migrate deploy + generate + seed)
- Dev server: `pnpm dev` — smoke test with `curl http://localhost:4000/health`
- Before committing: `pnpm typecheck` and `pnpm test`

## Tests

Vitest + supertest. `pnpm test` runs against a dedicated `<database>_test`
database that is created and migrated automatically; each test file truncates
it first, so never point `TEST_DATABASE_URL` at data you care about.

## Prisma 7

- Config lives in `prisma7.config.ts`; the datasource URL is not in the schema.
- The client is generated to `src/generated/prisma` and is not committed. `migrate dev` does not generate — run `pnpm db:generate` after schema changes.
- The client only works with the pg driver adapter — import the shared instance from `src/lib/prisma.ts`, never construct your own.
- `pnpm db:seed` resets `daily_metrics` and `events`; do not put data worth keeping in the seed.

## Agent skills

Three Prisma reference skills used by this codebase live in `.agents/skills/` (`prisma-cli`, `prisma-client-api`, `prisma-postgres-setup`), pinned by `skills-lock.json`. The unrelated ones (MongoDB, Prisma Compute, upgrade guides) were removed to keep the checkout small. Refresh: `pnpm dlx skills@1.5.14 add prisma/skills --skill prisma-cli --skill prisma-client-api --skill prisma-postgres-setup -y`.

## Conventions

- ESM + NodeNext: relative imports need the `.js` extension.
- Prettier: double quotes, no semicolons, 80 columns.
- Environment variables only through `src/config/env.ts`; never read `process.env` elsewhere.
- Throw `ApiError` (`src/middleware/error.ts`); every error response is `{ error: { code, message, details? } }`.
