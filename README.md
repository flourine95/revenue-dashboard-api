# Revenue Dashboard — API

REST API for the Revenue Dashboard coding challenge. It serves the dashboard
KPI/chart data and provides authenticated CRUD endpoints used by the admin
interface. Data is stored in PostgreSQL.

> The frontend lives in a separate repository (`revenue-dashboard-ui`). Run
> both together for the complete experience — see the frontend README.

## Tech stack

| Concern    | Choice                                       |
| ---------- | -------------------------------------------- |
| Runtime    | Node.js + Express 5 + TypeScript             |
| Database   | PostgreSQL 17 (Docker Compose for local dev) |
| ORM        | Prisma ORM 7 (migrations + seed)             |
| Validation | Zod                                          |
| Auth       | Server-side sessions, httpOnly cookie        |

> Prisma packages are pinned to the latest **stable** major (v7, `prisma@prev`)
> on purpose: Prisma ORM 8 was still a release candidate at the time of
> writing, and v7 remains fully supported.

## Prerequisites

- **Node.js** 20.19+, 22.12+ or 24+ (22 LTS recommended)
- **pnpm** — `npm install -g pnpm` (or `corepack enable`)
- **Docker** (Docker Desktop on macOS/Windows, Docker Engine + Compose plugin
  on Linux) — only needed to run the local PostgreSQL container

## Quick start (from a fresh machine)

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local environment file
cp .env.example .env

# 3. Start PostgreSQL (downloads postgres:17-alpine on first run)
pnpm db:up

# 4. Apply migrations, generate the Prisma client and load demo data
pnpm db:setup

# 5. Start the API in watch mode
pnpm dev
```

Check that everything works:

```bash
curl http://localhost:4000/health
# → {"status":"ok","database":"up"}
```

### Demo admin account

The seed creates an admin account from the values in `.env`:

| Email                 | Password    |
| --------------------- | ----------- |
| `admin@revenue.local` | `admin1234` |

These credentials are for **local development only** — never reuse them
anywhere real.

## Environment variables

| Variable              | Default                                           | Purpose                                 |
| --------------------- | ------------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`        | `postgresql://revenue:revenue@localhost:5432/...` | PostgreSQL connection string            |
| `NODE_ENV`            | `development`                                     | Runtime mode                            |
| `PORT`                | `4000`                                            | HTTP port                               |
| `CORS_ORIGIN`         | `http://localhost:3000`                           | Frontend origin allowed to send cookies |
| `SESSION_TTL_DAYS`    | `7`                                               | Admin session lifetime                  |
| `SEED_ADMIN_EMAIL`    | `admin@revenue.local`                             | Email of the seeded admin               |
| `SEED_ADMIN_PASSWORD` | `admin1234`                                       | Password of the seeded admin            |
| `SEED_ADMIN_NAME`     | `Admin`                                           | Display name of the seeded admin        |

## Database

### Schema

| Table           | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `users`         | Admin accounts (bcrypt password hash)                                       |
| `sessions`      | Server-side admin sessions (SHA-256 hashed opaque token, expiry)            |
| `daily_metrics` | One row per calendar day: POS revenue, Eatclub revenue, labour cost, covers |
| `events`        | Positive/negative events rendered as chart annotations                      |

### Migrations

```bash
pnpm db:migrate     # dev: create + apply a migration after schema changes
pnpm db:deploy      # prod/CI: apply existing migrations only
pnpm db:generate    # regenerate the Prisma client after schema changes
pnpm db:studio      # browse the database in Prisma Studio
pnpm db:reset       # drop everything, re-apply migrations and re-seed
```

### Demo seed data

`pnpm db:seed` (also run by `pnpm db:setup` and `pnpm db:reset`):

- 12 weeks of daily metrics, **relative to the day you run it**, so the
  dashboard always shows a full current week. The current week is filled
  Monday–Sunday for demo purposes.
- 5 sample events (positive and negative) spread across the history.
- The demo admin account described above.
- Re-running the seed intentionally resets `daily_metrics` and `events`.

## API endpoints

| Method | Path      | Auth | Description                      |
| ------ | --------- | ---- | -------------------------------- |
| GET    | `/health` | —    | Liveness + database connectivity |

Dashboard and admin endpoints are implemented in the next milestone and will
be documented here as they land.

Error responses always use a consistent shape:

```json
{
  "error": { "code": "NOT_FOUND", "message": "Route GET /nope does not exist" }
}
```

## Scripts reference

| Script           | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Start API with hot reload (`tsx watch`)        |
| `pnpm build`     | Compile TypeScript to `dist/`                  |
| `pnpm start`     | Run the compiled build (`node dist/index.js`)  |
| `pnpm typecheck` | Type-check without emitting                    |
| `pnpm format`    | Format the codebase with Prettier              |
| `pnpm db:up`     | Start the PostgreSQL container                 |
| `pnpm db:down`   | Stop the PostgreSQL container                  |
| `pnpm db:setup`  | Migrate + generate + seed (fresh setup helper) |

## Project structure

```
prisma/
  schema.prisma        # data model
  migrations/          # SQL migrations (applied by prisma migrate)
  seed.ts              # demo data generator
src/
  app.ts               # express app wiring (middleware, routes)
  index.ts             # server bootstrap + graceful shutdown
  config/env.ts        # validated environment variables
  lib/prisma.ts        # single Prisma client instance
  middleware/error.ts  # ApiError + consistent error responses
  routes/              # route handlers
  generated/prisma/    # generated Prisma client (not committed)
prisma7.config.ts      # Prisma CLI config (schema, migrations, seed)
docker-compose.yml     # local PostgreSQL 17
```

## Troubleshooting

- **`Can't reach database server` (Prisma P1001)** — the container may still
  be starting. Check with `docker compose ps` until it reports `healthy`, and
  confirm `DATABASE_URL` in `.env` matches `docker-compose.yml`.
- **Port 5432 already in use** — another PostgreSQL is running locally. Stop
  it, or change the host port in `docker-compose.yml` and `DATABASE_URL`.
- **Prisma client missing after cloning** — generated clients are not
  committed. Run `pnpm db:generate` (or any `db:*` setup command).
- **Prisma Node.js version warning** — use Node 20.19+, 22.12+ or 24+.
- **Docker not running** — start Docker Desktop / `sudo systemctl start docker`
  and retry `pnpm db:up`.
