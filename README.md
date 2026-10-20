# Revenue Dashboard API

REST API for the Revenue Dashboard coding challenge. It serves the data behind the dashboard and exposes the CRUD endpoints the admin screens use, backed by PostgreSQL.

> The frontend is a separate repository: [revenue-dashboard-ui](https://github.com/flourine95/revenue-dashboard-ui). The project overview is [revenue-dashboard](https://github.com/flourine95/revenue-dashboard).

## Stack

| Concern    | Choice                                       |
| ---------- | -------------------------------------------- |
| Runtime    | Node.js + Express 5 + TypeScript             |
| Database   | PostgreSQL 17 (Docker Compose for local dev) |
| ORM        | Prisma ORM 7 (migrations + seed)             |
| Validation | Zod                                          |
| Auth       | Server-side sessions, httpOnly cookie        |

Prisma is pinned to v7, the latest stable major. Version 8 was still a release candidate.

## Setup

You need:

- **Node.js** 20.19+, 22.12+ or 24+ (22 LTS recommended)
- **pnpm** 12.11.2: `corepack enable && corepack prepare pnpm@12.11.2 --activate`
- **Docker**: Docker Desktop on macOS or Windows, or Docker Engine with the Compose plugin on Linux. You need it only for the local PostgreSQL container.

```bash
pnpm install
cp .env.example .env
pnpm db:up        # downloads postgres:17-alpine on the first run
pnpm db:setup     # migrate, generate the Prisma client, load demo data
pnpm dev
```

Confirm the API answers:

```bash
curl http://localhost:4000/health
# → {"status":"ok","database":"up"}
```

### Demo admin account

`pnpm db:setup` creates this account from the values in `.env`:

| Email                 | Password    |
| --------------------- | ----------- |
| `admin@revenue.local` | `admin1234` |

These credentials are for local development only. Do not reuse them anywhere else.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://revenue:revenue@localhost:5432/...` | PostgreSQL connection string |
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend origin allowed to send cookies |
| `SESSION_TTL_DAYS` | `7` | Admin session lifetime |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed sign-ins allowed per client before a temporary lockout |
| `LOGIN_WINDOW_MINUTES` | `15` | Length of the failed-attempt window, in minutes |
| `BUDGET_WEEKLY_REVENUE` | `20000` | Weekly revenue budget exposed as `budget.weeklyRevenue` in the dashboard payload |
| `SEED_ADMIN_EMAIL` | `admin@revenue.local` | Email of the seeded admin |
| `SEED_ADMIN_PASSWORD` | `admin1234` | Password of the seeded admin |
| `SEED_ADMIN_NAME` | `Admin` | Display name of the seeded admin |

`TEST_DATABASE_URL` is optional and only used by the test suite. See [Tests](#tests).

## Database

### Schema

| Table | Purpose |
| --- | --- |
| `users` | Admin accounts (bcrypt password hash) |
| `sessions` | Server-side admin sessions (SHA-256 hashed opaque token, expiry) |
| `daily_metrics` | One row per calendar day: POS revenue, Eatclub revenue, labour cost, covers |
| `events` | Positive/negative events rendered as chart annotations |

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

- 60 weeks of daily metrics (about 14 months), counted back from the day you run the seed, so the dashboard always has a full current week and the year-over-year view has a year to compare. The current week is filled Monday to Sunday for demo purposes.
- 5 sample events (positive and negative) spread across the history.
- The demo admin account described above.
- Re-running the seed intentionally resets `daily_metrics` and `events`.

## Tests

```bash
pnpm test        # run once (Vitest + supertest)
pnpm test:watch  # watch mode
```

The suite covers the period and KPI maths as unit tests and the endpoints end to end. The integration tests use a dedicated `<database>_test` database, created and migrated on the first run, and truncate it before each file, so your development data is never touched. Set `TEST_DATABASE_URL` to point them at another database or server.

## API endpoints

All endpoints return JSON. Dates in requests and responses use the `YYYY-MM-DD` format. Error responses always use a consistent shape:

```json
{
  "error": { "code": "NOT_FOUND", "message": "Route GET /nope does not exist" }
}
```

Validation failures return `422` with `VALIDATION_ERROR` and an `error.details.issues` array. Too many failed sign-ins from one client return `429` with `TOO_MANY_REQUESTS`.

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | No | `{ email, password }` → user + session cookie |
| POST | `/api/auth/logout` | No | Ends the session and clears the cookie |
| GET | `/api/auth/me` | Yes | The signed-in user |

The session is an opaque token in an `httpOnly` cookie; only a SHA-256 hash of the token is stored in the database.

Repeated failures from one client are limited: after `LOGIN_MAX_ATTEMPTS` wrong passwords inside `LOGIN_WINDOW_MINUTES`, further attempts return `429` with `TOO_MANY_REQUESTS` and a `Retry-After` header. A successful sign-in clears the counter. The client is identified by `X-Forwarded-For` when present, otherwise by its socket address.

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@revenue.local","password":"admin1234"}'

curl -b cookies.txt http://localhost:4000/api/auth/me
```

### Dashboard

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | No | KPIs, chart series and events |
| GET | `/api/dashboard/year-over-year` | No | Same week 52 weeks earlier, with deltas |

| Parameter | Default | Meaning |
| --- | --- | --- |
| `from` | current Monday | Start of the period, inclusive (`YYYY-MM-DD`) |
| `to` | current Sunday | End of the period, inclusive (max 400 days) |
| `compare` | `true` | Include the equal-length previous-period comparison in the response |

`totalRevenue` is POS + Eatclub revenue, `averagePerDay` is the period total divided by the number of days, and `deltas` are percent changes versus the previous period (one decimal, `null` when the previous value is zero). Days without a `daily_metrics` row are zero-filled in `series`. The `comparison` key is omitted when `compare=false`.

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

### Year-over-year

`GET /api/dashboard/year-over-year` compares the requested week with the same week 52 weeks (364 days) earlier. It takes the same `from`/`to` parameters as `/api/dashboard` and defaults to the current week.

```json
{
  "period": { "from": "2025-10-20", "to": "2025-10-26" },
  "kpis": {
    "totalRevenue": 16300,
    "averagePerDay": 2328.57,
    "totalCovers": 911
  },
  "series": ["…same shape as the dashboard series…"],
  "current": {
    "period": { "from": "2026-10-19", "to": "2026-10-25" },
    "kpis": { "totalRevenue": 17934, "averagePerDay": 2562, "totalCovers": 986 }
  },
  "deltas": { "totalRevenue": 10, "averagePerDay": 10, "totalCovers": 8.2 }
}
```

### Admin (session cookie required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/admin/metrics` | List metric days (`?from=&to=`, defaults to the current week) |
| PUT | `/api/admin/metrics/:date` | Create or replace one day: `{ posRevenue, eatclubRevenue, labourCost, covers }` (upsert) |
| DELETE | `/api/admin/metrics/:date` | Delete one day (`204`; `404` when the day does not exist) |
| GET | `/api/admin/events` | List events (`?from=&to=`; all events when the range is omitted) |
| POST | `/api/admin/events` | Create an event: `{ date, type: "positive" \| "negative", title, description? }` (`201`) |
| PATCH | `/api/admin/events/:id` | Update any subset of the event fields |
| DELETE | `/api/admin/events/:id` | Delete an event (`204`; `404` when it does not exist) |

Every request without a valid session cookie is rejected with `401` (`UNAUTHORIZED`) by the API itself.

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
  index.ts              # server bootstrap and SIGINT/SIGTERM handling
  config/env.ts         # validated environment variables
  lib/                  # prisma client, dates, auth, validation, serializers
  middleware/           # ApiError handling and the session auth guard
  routes/               # auth, dashboard and admin route handlers
  services/             # period and KPI aggregation (pure functions)
  generated/prisma/     # generated Prisma client (not committed)
tests/
  unit/                 # pure period and KPI maths
  api/                  # endpoint tests against a throwaway database
prisma7.config.ts       # Prisma CLI config (schema, migrations, seed)
docker-compose.yml      # local PostgreSQL 17
vitest.config.ts        # test configuration
```

## Troubleshooting

`Can't reach database server` (Prisma P1001) means PostgreSQL is not accepting connections yet. Run `docker compose ps` until the container reports `healthy`, then check that `DATABASE_URL` in `.env` matches `docker-compose.yml`.

If port 5432 is taken, another PostgreSQL is running locally. Stop it, or change the host port in `docker-compose.yml` together with `DATABASE_URL`.

A missing Prisma client after cloning is expected: the client is generated, not committed. Run `pnpm db:generate`, or any `db:` command that includes it.

Tests that cannot create their database need a user with the `CREATEDB` right. Create `<database>_test` by hand, or point `TEST_DATABASE_URL` at an empty database, then run `pnpm test` again.

If Prisma warns about the Node.js version, move to 20.19+, 22.12+ or 24+.

If `pnpm db:up` fails to reach Docker, start Docker Desktop or run `sudo systemctl start docker`.
