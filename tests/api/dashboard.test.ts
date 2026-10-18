import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import { env } from "../../src/config/env.js"
import { toUtcDate } from "../../src/lib/dates.js"
import { prisma } from "../../src/lib/prisma.js"
import { createMetric, resetDb } from "../helpers.js"

const app = createApp()

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/dashboard", () => {
  it("computes KPIs, fills the series and compares to the previous period", async () => {
    // Previous week (2026-10-05..11): 7 days x 100 revenue, 10 covers.
    for (let day = 5; day <= 11; day += 1) {
      const date = `2026-10-${String(day).padStart(2, "0")}`
      await createMetric(date, { pos: 60, eatclub: 40, covers: 10 })
    }
    // Current week (2026-10-12..18): only 2 rows; the rest are zero-filled.
    await createMetric("2026-10-12", {
      pos: 200,
      eatclub: 0,
      labour: 50,
      covers: 8,
    })
    await createMetric("2026-10-13", { pos: 50, eatclub: 50, covers: 2 })

    const response = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18"
    )

    expect(response.status).toBe(200)
    const body = response.body
    expect(body.period).toEqual({ from: "2026-10-12", to: "2026-10-18" })
    expect(body.series).toHaveLength(7)
    expect(body.series[0]).toMatchObject({
      date: "2026-10-12",
      posRevenue: 200,
      eatclubRevenue: 0,
      labourCost: 50,
      covers: 8,
    })
    expect(body.series[2]).toMatchObject({
      date: "2026-10-14",
      posRevenue: 0,
      eatclubRevenue: 0,
      covers: 0,
    })

    expect(body.kpis).toEqual({
      totalRevenue: 300,
      averagePerDay: 42.86,
      totalCovers: 10,
    })
    expect(body.comparison.period).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    })
    expect(body.comparison.kpis.totalRevenue).toBe(700)
    expect(body.comparison.deltas.totalRevenue).toBe(-57.1)
    expect(body.comparison.deltas.totalCovers).toBe(-85.7)
  })

  it("returns null deltas when there is no baseline", async () => {
    const response = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18"
    )

    expect(response.body.kpis).toEqual({
      totalRevenue: 0,
      averagePerDay: 0,
      totalCovers: 0,
    })
    expect(response.body.comparison.deltas.totalRevenue).toBeNull()
  })

  it("skips the comparison when compare=false", async () => {
    const response = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18&compare=false"
    )

    expect(response.status).toBe(200)
    expect(response.body.comparison).toBeUndefined()
  })

  it("includes the events of the period", async () => {
    await prisma.event.create({
      data: {
        date: toUtcDate("2026-10-14"),
        type: "positive",
        title: "Big catering order",
      },
    })
    await prisma.event.create({
      data: {
        date: toUtcDate("2026-09-01"),
        type: "negative",
        title: "Outside the period",
      },
    })

    const response = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18"
    )

    expect(response.body.events).toHaveLength(1)
    expect(response.body.events[0]).toMatchObject({
      date: "2026-10-14",
      type: "positive",
      title: "Big catering order",
    })
  })

  it("rejects invalid ranges", async () => {
    const impossible = await request(app).get("/api/dashboard?from=2026-02-31")
    expect(impossible.status).toBe(400)

    const reversed = await request(app).get(
      "/api/dashboard?from=2026-10-18&to=2026-10-12"
    )
    expect(reversed.status).toBe(400)
  })

  it("includes the configured weekly budget in both shapes", async () => {
    const expected = { weeklyRevenue: env.BUDGET_WEEKLY_REVENUE }

    const withComparison = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18"
    )
    expect(withComparison.body.budget).toEqual(expected)

    const withoutComparison = await request(app).get(
      "/api/dashboard?from=2026-10-12&to=2026-10-18&compare=false"
    )
    expect(withoutComparison.body.budget).toEqual(expected)
  })
})
