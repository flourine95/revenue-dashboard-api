import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BUDGET_WEEKLY_REVENUE: z.coerce.number().nonnegative().default(20000),
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
