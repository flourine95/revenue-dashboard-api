import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import { env } from "../src/config/env.js"
import { PrismaClient } from "../src/generated/prisma/client.js"

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const WEEKS_OF_HISTORY = 12
const CURRENT_WEEK_BOOST = 0.045

// Deterministic PRNG so repeated seeds produce the same values.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20261018)

function between(min: number, max: number): number {
  return min + rand() * (max - min)
}

function toUtcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function todayUtc(): Date {
  const now = new Date()
  return toUtcDate(now.getFullYear(), now.getMonth(), now.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function mondayOf(date: Date): Date {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  return addDays(date, -daysSinceMonday)
}

type MetricRow = {
  date: Date
  posRevenue: number
  eatclubRevenue: number
  labourCost: number
  covers: number
}

async function seedDailyMetrics(): Promise<number> {
  const currentMonday = mondayOf(todayUtc())
  const rows: MetricRow[] = []

  for (let weeksAgo = WEEKS_OF_HISTORY - 1; weeksAgo >= 0; weeksAgo--) {
    const weekMonday = addDays(currentMonday, -7 * weeksAgo)
    // Current week lands ~+5–7% over the previous one, like the reference UI.
    const trend =
      1 +
      0.012 * (WEEKS_OF_HISTORY - 1 - weeksAgo) +
      (weeksAgo === 0 ? CURRENT_WEEK_BOOST : 0)

    for (let day = 0; day < 7; day++) {
      // Days after today are filled too, so the demo week always looks complete.
      const date = addDays(weekMonday, day)
      const isWeekend = day >= 5

      const posBase = isWeekend ? between(2250, 2450) : between(1580, 1880)
      const posRevenue = Math.round(posBase * trend * between(0.95, 1.05))

      const eatclubShare = isWeekend ? between(0.14, 0.28) : between(0.08, 0.2)
      const eatclubRevenue = Math.round(
        posRevenue * eatclubShare * between(0.6, 1.15)
      )

      const labourRatio = isWeekend ? between(0.33, 0.4) : between(0.34, 0.43)
      const labourCost = Math.round((posRevenue + eatclubRevenue) * labourRatio)

      const covers = Math.round((posRevenue + eatclubRevenue) / between(17, 20))

      rows.push({ date, posRevenue, eatclubRevenue, labourCost, covers })
    }
  }

  await prisma.dailyMetric.deleteMany()
  await prisma.dailyMetric.createMany({ data: rows })
  return rows.length
}

async function seedEvents(): Promise<number> {
  const currentMonday = mondayOf(todayUtc())

  // Relative to the current week; dayIndex 0 = Monday.
  const dayOfWeek = (weeksAgo: number, dayIndex: number): Date =>
    addDays(currentMonday, -7 * weeksAgo + dayIndex)

  const events = [
    {
      date: dayOfWeek(0, 4),
      type: "negative",
      title: "Kitchen equipment failure",
      description:
        "Oven breakdown during Friday dinner service — reduced seating capacity for about two hours.",
    },
    {
      date: dayOfWeek(0, 5),
      type: "positive",
      title: "Local festival boost",
      description:
        "Street festival nearby brought a wave of walk-ins and a strong late-night crowd.",
    },
    {
      date: dayOfWeek(3, 2),
      type: "positive",
      title: "Eatclub campaign launch",
      description:
        "First week of the Eatclub promotion — platform orders doubled on weekdays.",
    },
    {
      date: dayOfWeek(6, 3),
      type: "negative",
      title: "Stormy weather",
      description:
        "Heavy rain through the evening — dine-in covers down noticeably.",
    },
    {
      date: dayOfWeek(10, 4),
      type: "positive",
      title: "Corporate booking",
      description:
        "Private dining room booked for a 32-person corporate dinner.",
    },
  ] satisfies Array<{
    date: Date
    type: "positive" | "negative"
    title: string
    description: string
  }>

  await prisma.event.deleteMany()
  await prisma.event.createMany({ data: events })
  return events.length
}

async function seedAdminUser(): Promise<string> {
  const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10)

  const admin = await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: { name: env.SEED_ADMIN_NAME, passwordHash },
    create: {
      email: env.SEED_ADMIN_EMAIL,
      name: env.SEED_ADMIN_NAME,
      passwordHash,
    },
  })

  return admin.email
}

async function main(): Promise<void> {
  console.log("Seeding demo data (resets daily metrics and events)...")

  const days = await seedDailyMetrics()
  const events = await seedEvents()
  const adminEmail = await seedAdminUser()

  console.log(`  daily metrics : ${days} days across ${WEEKS_OF_HISTORY} weeks`)
  console.log(`  events        : ${events}`)
  console.log(`  admin user    : ${adminEmail}`)
  console.log("Seed complete.")
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
