import type { DailyMetric, Event } from "../generated/prisma/client.js"
import { formatDate } from "./dates.js"

export type MetricDto = {
  date: string
  posRevenue: number
  eatclubRevenue: number
  labourCost: number
  covers: number
}

export type EventDto = {
  id: string
  date: string
  type: string
  title: string
  description: string | null
}

/** Converts Prisma model rows into JSON-friendly API shapes. */
export function serializeMetric(row: DailyMetric): MetricDto {
  return {
    date: formatDate(row.date),
    posRevenue: row.posRevenue.toNumber(),
    eatclubRevenue: row.eatclubRevenue.toNumber(),
    labourCost: row.labourCost.toNumber(),
    covers: row.covers,
  }
}

export function serializeEvent(row: Event): EventDto {
  return {
    id: row.id,
    date: formatDate(row.date),
    type: row.type,
    title: row.title,
    description: row.description,
  }
}
