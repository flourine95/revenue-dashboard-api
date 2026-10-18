import { execSync } from "node:child_process"
import pg from "pg"
import { testDatabaseUrl } from "./test-db.js"

/** Creates the test database if needed, then applies migrations to it. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl())
  const database = url.pathname.slice(1)

  const maintenanceUrl = new URL(url)
  maintenanceUrl.pathname = "/postgres"

  const client = new pg.Client({ connectionString: maintenanceUrl.toString() })
  await client.connect()
  const existing = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [database]
  )
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${database}"`)
  }
  await client.end()

  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: "inherit",
  })
}
