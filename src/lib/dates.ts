import { ApiError } from "../middleware/error.js"

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 400
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toUtcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !DATE_PATTERN.test(value) ||
    Number.isNaN(date.getTime()) ||
    formatDate(date) !== value
  ) {
    throw ApiError.badRequest(
      `"${value}" is not a valid date (expected YYYY-MM-DD)`
    )
  }
  return date
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

export function todayUtc(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7))
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1
}

/**
 * Resolves a from/to date range. Defaults to the current (UTC) week,
 * Monday-Sunday, when the caller passes nothing.
 */
export function resolveRange(
  from?: string,
  to?: string
): { from: Date; to: Date } {
  let start: Date
  let end: Date

  if (from === undefined && to !== undefined) {
    end = toUtcDate(to)
    start = addDays(end, -6)
  } else if (from !== undefined && to === undefined) {
    start = toUtcDate(from)
    end = addDays(start, 6)
  } else if (from !== undefined && to !== undefined) {
    start = toUtcDate(from)
    end = toUtcDate(to)
  } else {
    start = startOfWeek(todayUtc())
    end = addDays(start, 6)
  }

  if (start.getTime() > end.getTime()) {
    throw ApiError.badRequest(`"from" must not be after "to"`)
  }
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    throw ApiError.badRequest(`Range must be ${MAX_RANGE_DAYS} days or fewer`)
  }

  return { from: start, to: end }
}
