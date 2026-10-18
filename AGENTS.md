# Revenue Dashboard API

Express 5 + TypeScript (ESM) REST API. PostgreSQL through Prisma ORM 7. Admin auth via server-side sessions.

## Commands

- Install: `pnpm install`
- Start local DB: `pnpm db:up` — Docker Compose, postgres:17 on port 5432
- Fresh setup: `pnpm db:setup` (migrate deploy + generate + seed)
- Dev server: `pnpm dev` — smoke test with `curl http://localhost:4000/health`
- Before committing: `pnpm typecheck` (no test suite yet)

## Prisma 7

- Config lives in `prisma7.config.ts`; the datasource URL is not in the schema.
- The client is generated to `src/generated/prisma` and is not committed. `migrate dev` does not generate — run `pnpm db:generate` after schema changes.
- The client only works with the pg driver adapter — import the shared instance from `src/lib/prisma.ts`, never construct your own.
- `pnpm db:seed` resets `daily_metrics` and `events`; do not put data worth keeping in the seed.

## Agent skills

Official Prisma agent skills live in `.agents/skills/` (canonical; pinned by `skills-lock.json`). Keep them there instead of duplicating into tool-specific folders like `.claude/` or `.windsurf/`. Refresh: `pnpm dlx skills@1.5.14 add prisma/skills --agent cursor claude-code codex windsurf --skill "*" -y`.

## Conventions

- ESM + NodeNext: relative imports need the `.js` extension.
- Prettier: double quotes, no semicolons, 80 columns.
- Environment variables only through `src/config/env.ts`; never read `process.env` elsewhere.
- Throw `ApiError` (`src/middleware/error.ts`); every error response is `{ error: { code, message, details? } }`.
