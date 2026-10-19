import { describe, expect, it } from "vitest"
import {
  addDays,
  formatDate,
  resolveRange,
  todayUtc,
  toUtcDate,
} from "../../src/lib/dates.js"
import type { DailyMetric } from "../../src/generated/prisma/client.js"
import {
  buildSeries,
  computeKpis,
  percentDelta,
  previousRange,
  previousYearRange,
} from "../../src/services/dashboard.js"

/** Structural stub of a Prisma row; a Decimal only needs `toNumber()`. */
const decimal = (value: number) => ({ toNumber: () => value })

function metricRow(
  date: string,
  values: { pos: number; eatclub: number; labour?: number; covers?: number }
): DailyMetric {
  return {
    id: `row-${date}`,
    date: toUtcDate(date),
    posRevenue: decimal(values.pos),
    eatclubRevenue: decimal(values.eatclub),
    labourCost: decimal(values.labour ?? 0),
    covers: values.covers ?? 0,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  } as unknown as DailyMetric
}

describe("buildSeries", () => {
  it("fills days without rows with zeroes", () => {
    const rows = [
      metricRow("2026-10-12", { pos: 100, eatclub: 20, labour: 50, covers: 8 }),
      metricRow("2026-10-14", { pos: 10, eatclub: 0, labour: 5, covers: 1 }),
    ]
    const series = buildSeries(
      rows,
      toUtcDate("2026-10-12"),
      toUtcDate("2026-10-18")
    )

    expect(series).toHaveLength(7)
    expect(series[0]).toEqual({
      date: "2026-10-12",
      posRevenue: 100,
      eatclubRevenue: 20,
      labourCost: 50,
      covers: 8,
    })
    expect(series[1]).toEqual({
      date: "2026-10-13",
      posRevenue: 0,
      eatclubRevenue: 0,
      labourCost: 0,
      covers: 0,
    })
    expect(series[6]?.date).toBe("2026-10-18")
  })
})

describe("computeKpis", () => {
  it("sums revenue and covers and averages over the period", () => {
    const series = buildSeries(
      [
        metricRow("2026-10-12", { pos: 100, eatclub: 50, covers: 10 }),
        metricRow("2026-10-13", { pos: 50, eatclub: 0, covers: 5 }),
      ],
      toUtcDate("2026-10-12"),
      toUtcDate("2026-10-18")
    )

    expect(computeKpis(series)).toEqual({
      totalRevenue: 200,
      averagePerDay: 28.57,
      totalCovers: 15,
    })
  })

  it("rounds floating point noise to cents", () => {
    const series = [
      {
        date: "2026-10-12",
        posRevenue: 0.1,
        eatclubRevenue: 0.2,
        labourCost: 0,
        covers: 0,
      },
    ]
    expect(computeKpis(series).totalRevenue).toBe(0.3)
  })

  it("returns zero KPIs for an empty period", () => {
    expect(computeKpis([])).toEqual({
      totalRevenue: 0,
      averagePerDay: 0,
      totalCovers: 0,
    })
  })
})

describe("previousRange", () => {
  it("returns the equal-length window right before", () => {
    expect(
      previousRange(toUtcDate("2026-10-12"), toUtcDate("2026-10-18"))
    ).toEqual({
      from: toUtcDate("2026-10-05"),
      to: toUtcDate("2026-10-11"),
    })
  })

  it("handles ranges that are not whole weeks", () => {
    const range = previousRange(
      toUtcDate("2026-10-01"),
      toUtcDate("2026-10-10")
    )
    expect(formatDate(range.from)).toBe("2026-09-21")
    expect(formatDate(range.to)).toBe("2026-09-30")
  })
})

describe("previousYearRange", () => {
  it("moves the range back 52 weeks so weekdays stay aligned", () => {
    expect(
      previousYearRange(toUtcDate("2026-10-12"), toUtcDate("2026-10-18"))
    ).toEqual({
      from: toUtcDate("2025-10-13"),
      to: toUtcDate("2025-10-19"),
    })
  })
})

describe("percentDelta", () => {
  it("rounds to one decimal", () => {
    expect(percentDelta(18336, 16576)).toBe(10.6)
    expect(percentDelta(300, 700)).toBe(-57.1)
  })

  it("returns null when there is no baseline", () => {
    expect(percentDelta(0, 0)).toBeNull()
    expect(percentDelta(100, 0)).toBeNull()
  })
})

describe("resolveRange", () => {
  it("defaults to the current UTC week, Monday through Sunday", () => {
    const range = resolveRange()
    const today = todayUtc().getTime()
    expect(range.from.getUTCDay()).toBe(1)
    expect(formatDate(range.to)).toBe(formatDate(addDays(range.from, 6)))
    expect(range.from.getTime()).toBeLessThanOrEqual(today)
    expect(today).toBeLessThanOrEqual(range.to.getTime())
  })

  it("derives a full week from a single bound", () => {
    expect(formatDate(resolveRange("2026-10-14").to)).toBe("2026-10-20")
    expect(formatDate(resolveRange(undefined, "2026-10-14").from)).toBe(
      "2026-10-08"
    )
  })

  it("rejects invalid, reversed and oversized ranges", () => {
    expect(() => resolveRange("2026-02-31")).toThrowError(/not a valid date/)
    expect(() => resolveRange("2026-10-18", "2026-10-12")).toThrowError(
      /"from" must not be after "to"/
    )
    expect(() => resolveRange("2024-01-01", "2026-01-01")).toThrowError(
      /400 days or fewer/
    )
  })
})
