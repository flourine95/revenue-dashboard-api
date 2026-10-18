import { Router } from "express"
import { z } from "zod"
import { env } from "../config/env.js"
import { formatDate, resolveRange } from "../lib/dates.js"
import { prisma } from "../lib/prisma.js"
import { serializeEvent } from "../lib/serialize.js"
import { dateSchema, parseInput } from "../lib/validation.js"
import {
  buildSeries,
  computeKpis,
  percentDelta,
  previousRange,
} from "../services/dashboard.js"

const dashboardQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  compare: z.enum(["true", "false", "1", "0"]).optional(),
})

const metricRange = (from: Date, to: Date) =>
  prisma.dailyMetric.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  })

export const dashboardRouter = Router()

dashboardRouter.get("/", async (req, res) => {
  const query = parseInput(dashboardQuerySchema, req.query)
  const { from, to } = resolveRange(query.from, query.to)
  const compare =
    query.compare === undefined ||
    query.compare === "true" ||
    query.compare === "1"

  const previous = compare ? previousRange(from, to) : null
  const [metricRows, eventRows, previousRows] = await Promise.all([
    metricRange(from, to),
    prisma.event.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    previous === null
      ? Promise.resolve([])
      : metricRange(previous.from, previous.to),
  ])

  const series = buildSeries(metricRows, from, to)
  const kpis = computeKpis(series)
  const period = { from: formatDate(from), to: formatDate(to) }
  const events = eventRows.map(serializeEvent)
  const budget = { weeklyRevenue: env.BUDGET_WEEKLY_REVENUE }

  if (previous === null) {
    res.json({ period, kpis, series, events, budget })
    return
  }

  const previousSeries = buildSeries(previousRows, previous.from, previous.to)
  const previousKpis = computeKpis(previousSeries)

  res.json({
    period,
    kpis,
    series,
    events,
    budget,
    comparison: {
      period: {
        from: formatDate(previous.from),
        to: formatDate(previous.to),
      },
      kpis: previousKpis,
      series: previousSeries,
      deltas: {
        totalRevenue: percentDelta(
          kpis.totalRevenue,
          previousKpis.totalRevenue
        ),
        averagePerDay: percentDelta(
          kpis.averagePerDay,
          previousKpis.averagePerDay
        ),
        totalCovers: percentDelta(kpis.totalCovers, previousKpis.totalCovers),
      },
    },
  })
})
