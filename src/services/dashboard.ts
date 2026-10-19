import type { DailyMetric } from "../generated/prisma/client.js"
import { addDays, daysBetween, formatDate } from "../lib/dates.js"
import { serializeMetric, type MetricDto } from "../lib/serialize.js"

export type Kpis = {
  totalRevenue: number
  averagePerDay: number
  totalCovers: number
}

export type KpiDeltas = {
  totalRevenue: number | null
  averagePerDay: number | null
  totalCovers: number | null
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Fills the whole range, using zeroes for days without a metric row. */
export function buildSeries(
  rows: DailyMetric[],
  from: Date,
  to: Date
): MetricDto[] {
  const byDate = new Map(rows.map((row) => [formatDate(row.date), row]))
  const series: MetricDto[] = []

  for (let index = 0; index < daysBetween(from, to); index += 1) {
    const date = formatDate(addDays(from, index))
    const row = byDate.get(date)
    series.push(
      row === undefined
        ? { date, posRevenue: 0, eatclubRevenue: 0, labourCost: 0, covers: 0 }
        : serializeMetric(row)
    )
  }

  return series
}

export function computeKpis(series: MetricDto[]): Kpis {
  let totalRevenue = 0
  let totalCovers = 0

  for (const day of series) {
    totalRevenue += day.posRevenue + day.eatclubRevenue
    totalCovers += day.covers
  }

  totalRevenue = roundTo(totalRevenue, 2)

  return {
    totalRevenue,
    averagePerDay:
      series.length === 0 ? 0 : roundTo(totalRevenue / series.length, 2),
    totalCovers,
  }
}

/** Equal-length window immediately before [from, to]. */
export function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const previousTo = addDays(from, -1)
  return {
    from: addDays(previousTo, -(daysBetween(from, to) - 1)),
    to: previousTo,
  }
}

/**
 * Same period 52 weeks (364 days) earlier. Shifting by 52 weeks instead of a
 * calendar year keeps Monday-Sunday weeks aligned, which matters for a weekly
 * dashboard.
 */
export function previousYearRange(
  from: Date,
  to: Date
): { from: Date; to: Date } {
  return { from: addDays(from, -364), to: addDays(to, -364) }
}

/** Percent change rounded to one decimal; null when there is no baseline. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return roundTo(((current - previous) / previous) * 100, 1)
}
