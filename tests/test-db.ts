import "dotenv/config"

/**
 * Tests run against a dedicated database so they can truncate freely.
 * Derived from TEST_DATABASE_URL, or from DATABASE_URL with a `_test` suffix.
 */
export function testDatabaseUrl(): string {
  const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (source === undefined || source.length === 0) {
    throw new Error(
      "DATABASE_URL is required for tests (copy .env.example to .env)"
    )
  }
  const url = new URL(source)
  url.pathname = `${url.pathname}_test`
  return url.toString()
}
