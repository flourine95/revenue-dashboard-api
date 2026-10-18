import { defineConfig } from "vitest/config"
import { testDatabaseUrl } from "./tests/test-db.js"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
    },
    // Test files share one database, so they must not run concurrently.
    fileParallelism: false,
  },
})
