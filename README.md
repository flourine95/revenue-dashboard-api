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

| Variable                | Default                                           | Purpose                                                                          |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://revenue:revenue@localhost:5432/...` | PostgreSQL connection string                                                     |
| `NODE_ENV`              | `development`                                     | Runtime mode                                                                     |
| `PORT`                  | `4000`                                            | HTTP port                                                                        |
| `CORS_ORIGIN`           | `http://localhost:3000`                           | Frontend origin allowed to send cookies                                          |
| `SESSION_TTL_DAYS`      | `7`                                               | Admin session lifetime                                                           |
| `BUDGET_WEEKLY_REVENUE` | `20000`                                           | Weekly revenue budget exposed as `budget.weeklyRevenue` in the dashboard payload |
| `SEED_ADMIN_EMAIL`      | `admin@revenue.local`                             | Email of the seeded admin                                                        |
| `SEED_ADMIN_PASSWORD`   | `admin1234`                                       | Password of the seeded admin                                                     |
| `SEED_ADMIN_NAME`       | `Admin`                                           | Display name of the seeded admin                                                 |

`TEST_DATABASE_URL` is optional and only used by the test suite — see
[Tests](#tests).

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

## Tests

```bash
pnpm test        # run once (Vitest + supertest)
pnpm test:watch  # watch mode
```

The suite covers the period/KPI math (unit) and the API endpoints end to end
(integration). Integration tests run against a dedicated `<database>_test`
database that is created and migrated automatically on the first run; each
test file truncates it first, so it never touches your development data. Set
`TEST_DATABASE_URL` to use a different database name or server for tests.

## API endpoints

All endpoints return JSON. Dates in requests and responses use the
`YYYY-MM-DD` format. Error responses always use a consistent shape:

```json
{
  "error": { "code": "NOT_FOUND", "message": "Route GET /nope does not exist" }
}
```

Validation failures return `422` with `VALIDATION_ERROR` and an
`error.details.issues` array.

### Auth

| Method | Path               | Auth | Description                                   |
| ------ | ------------------ | ---- | --------------------------------------------- |
| POST   | `/api/auth/login`  | —    | `{ email, password }` → user + session cookie |
| POST   | `/api/auth/logout` | —    | Ends the session and clears the cookie        |
| GET    | `/api/auth/me`     | ✅   | The signed-in user                            |

The session is an opaque token in an `httpOnly` cookie; only a SHA-256 hash
of the token is stored in the database.

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@revenue.local","password":"admin1234"}'

curl -b cookies.txt http://localhost:4000/api/auth/me
```

### Dashboard

| Method | Path             | Auth | Description                   |
| ------ | ---------------- | ---- | ----------------------------- |
| GET    | `/api/dashboard` | —    | KPIs, chart series and events |

| Parameter | Default        | Meaning                                                             |
| --------- | -------------- | ------------------------------------------------------------------- |
| `from`    | current Monday | Start of the period, inclusive (`YYYY-MM-DD`)                       |
| `to`      | current Sunday | End of the period, inclusive (max 400 days)                         |
| `compare` | `true`         | Include the equal-length previous-period comparison in the response |

`totalRevenue` is POS + Eatclub revenue, `averagePerDay` is the period total
divided by the number of days, and `deltas` are percent changes versus the
previous period (one decimal, `null` when the previous value is zero). Days
without a `daily_metrics` row are zero-filled in `series`. The `comparison`
key is omitted when `compare=false`.

```json
{
  "period": { "from": "2026-10-12", "to": "2026-10-18" },
  "kpis": {
    "totalRevenue": 18336,
    "averagePerDay": 2619.43,
    "totalCovers": 1000
  },
  "budget": { "weeklyRevenue": 20000 },
  "series": [
    {
      "date": "2026-10-12",
      "posRevenue": 1234.5,
      "eatclubRevenue": 210,
      "labourCost": 890,
      "covers": 132
    }
  ],
  "events": [
    {
      "id": "cmvd...",
      "date": "2026-10-14",
      "type": "positive",
      "title": "Big catering order",
      "description": null
    }
  ],
  "comparison": {
    "period": { "from": "2026-10-05", "to": "2026-10-11" },
    "kpis": {
      "totalRevenue": 16576,
      "averagePerDay": 2368,
      "totalCovers": 898
    },
    "series": ["…same shape as series…"],
    "deltas": {
      "totalRevenue": 10.6,
      "averagePerDay": 10.6,
      "totalCovers": 11.4
    }
  }
}
```

### Admin (session cookie required)

| Method | Path                       | Description                                                                              |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/admin/metrics`       | List metric days (`?from=&to=`, defaults to the current week)                            |
| PUT    | `/api/admin/metrics/:date` | Create or replace one day: `{ posRevenue, eatclubRevenue, labourCost, covers }` (upsert) |
| DELETE | `/api/admin/metrics/:date` | Delete one day (`204`; `404` when the day does not exist)                                |
| GET    | `/api/admin/events`        | List events (`?from=&to=`; all events when the range is omitted)                         |
| POST   | `/api/admin/events`        | Create an event: `{ date, type: "positive" \| "negative", title, description? }` (`201`) |
| PATCH  | `/api/admin/events/:id`    | Update any subset of the event fields                                                    |
| DELETE | `/api/admin/events/:id`    | Delete an event (`204`; `404` when it does not exist)                                    |

Every request without a valid session cookie is rejected with `401`
(`UNAUTHORIZED`) by the API itself, not just by the UI.

## Scripts reference

| Script            | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Start API with hot reload (`tsx watch`)        |
| `pnpm build`      | Compile TypeScript to `dist/`                  |
| `pnpm start`      | Run the compiled build (`node dist/index.js`)  |
| `pnpm typecheck`  | Type-check without emitting                    |
| `pnpm test`       | Run the test suite (Vitest)                    |
| `pnpm test:watch` | Run tests in watch mode                        |
| `pnpm format`     | Format the codebase with Prettier              |
| `pnpm db:up`      | Start the PostgreSQL container                 |
| `pnpm db:down`    | Stop the PostgreSQL container                  |
| `pnpm db:setup`   | Migrate + generate + seed (fresh setup helper) |

## Project structure

```
prisma/
  schema.prisma         # data model
  migrations/           # SQL migrations (applied by prisma migrate)
  seed.ts               # demo data generator
src/
  app.ts                # express app wiring (middleware, routes)
  index.ts              # server bootstrap + graceful shutdown
  config/env.ts         # validated environment variables
  lib/                  # prisma client, dates, auth, validation, serializers
  middleware/           # ApiError handling + session auth guard
  routes/               # auth, dashboard and admin route handlers
  services/             # period/KPI aggregation (pure functions)
  generated/prisma/     # generated Prisma client (not committed)
tests/
  unit/                 # pure period/KPI math
  api/                  # endpoint tests against a throwaway database
prisma7.config.ts       # Prisma CLI config (schema, migrations, seed)
docker-compose.yml      # local PostgreSQL 17
vitest.config.ts        # test configuration
```

## Troubleshooting

- **`Can't reach database server` (Prisma P1001)** — the container may still
  be starting. Check with `docker compose ps` until it reports `healthy`, and
  confirm `DATABASE_URL` in `.env` matches `docker-compose.yml`.
- **Port 5432 already in use** — another PostgreSQL is running locally. Stop
  it, or change the host port in `docker-compose.yml` and `DATABASE_URL`.
- **Prisma client missing after cloning** — generated clients are not
  committed. Run `pnpm db:generate` (or any `db:*` setup command).
- **Tests cannot create the test database** — the database user needs
  permission to create databases. Create `<database>_test` manually (or set
  `TEST_DATABASE_URL` to an existing empty database) and re-run `pnpm test`.
- **Prisma Node.js version warning** — use Node 20.19+, 22.12+ or 24+.
- **Docker not running** — start Docker Desktop / `sudo systemctl start docker`
  and retry `pnpm db:up`.
