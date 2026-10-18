import "dotenv/config"
import { z } from "zod"

/**
 * All environment variables used by the API, validated once at startup.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Origin of the web app, allowed to send cookie-authenticated requests. */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /** How long an admin session stays valid, in days. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Demo admin account created by the seed script. */
  SEED_ADMIN_EMAIL: z.string().default("admin@revenue.local"),
  SEED_ADMIN_PASSWORD: z.string().default("admin1234"),
  SEED_ADMIN_NAME: z.string().default("Admin"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment configuration:")
  console.error(JSON.stringify(parsed.error.issues, null, 2))
  process.exit(1)
}

export const env = parsed.data
