import bcrypt from "bcryptjs"
import { toUtcDate } from "../src/lib/dates.js"
import { prisma } from "../src/lib/prisma.js"

export const TEST_ADMIN = {
  email: "test-admin@revenue.local",
  password: "test-password-123",
  name: "Test Admin",
}

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sessions", "daily_metrics", "events", "users" CASCADE'
  )
}

export async function createAdmin(): Promise<void> {
  await prisma.user.create({
    data: {
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.name,
      passwordHash: await bcrypt.hash(TEST_ADMIN.password, 10),
    },
  })
}

export async function createMetric(
  date: string,
  values: { pos: number; eatclub: number; labour?: number; covers?: number }
): Promise<void> {
  await prisma.dailyMetric.create({
    data: {
      date: toUtcDate(date),
      posRevenue: values.pos,
      eatclubRevenue: values.eatclub,
      labourCost: values.labour ?? 0,
      covers: values.covers ?? 0,
    },
  })
}
