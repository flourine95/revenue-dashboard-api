import { Router } from "express"
import { z } from "zod"
import type { Prisma } from "../generated/prisma/client.js"
import { resolveRange, toUtcDate } from "../lib/dates.js"
import { prisma } from "../lib/prisma.js"
import { serializeEvent, serializeMetric } from "../lib/serialize.js"
import { dateSchema, parseInput } from "../lib/validation.js"
import { requireAuth } from "../middleware/auth.js"
import { ApiError } from "../middleware/error.js"

const MAX_REVENUE = 9_999_999_999.99

const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
})

const metricBodySchema = z.object({
  posRevenue: z.coerce.number().finite().min(0).max(MAX_REVENUE),
  eatclubRevenue: z.coerce.number().finite().min(0).max(MAX_REVENUE),
  labourCost: z.coerce.number().finite().min(0).max(MAX_REVENUE),
  covers: z.coerce.number().int().min(0).max(1_000_000),
})

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or fewer")
  .transform((value) => (value === "" ? null : value))
  .nullish()

const eventCreateSchema = z.object({
  date: dateSchema,
  type: z.enum(["positive", "negative"]),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or fewer"),
  description: descriptionSchema,
})

const eventUpdateSchema = eventCreateSchema.partial()

export const adminRouter = Router()

adminRouter.use(requireAuth)

adminRouter.get("/metrics", async (req, res) => {
  const query = parseInput(rangeQuerySchema, req.query)
  const { from, to } = resolveRange(query.from, query.to)

  const rows = await prisma.dailyMetric.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  })

  res.json({ metrics: rows.map(serializeMetric) })
})

adminRouter.put("/metrics/:date", async (req, res) => {
  const dateParam = parseInput(dateSchema, req.params.date)
  const date = toUtcDate(dateParam)
  const body = parseInput(metricBodySchema, req.body)

  const metric = await prisma.dailyMetric.upsert({
    where: { date },
    create: { date, ...body },
    update: body,
  })

  res.json({ metric: serializeMetric(metric) })
})

adminRouter.delete("/metrics/:date", async (req, res) => {
  const dateParam = parseInput(dateSchema, req.params.date)
  const { count } = await prisma.dailyMetric.deleteMany({
    where: { date: toUtcDate(dateParam) },
  })

  if (count === 0) {
    throw ApiError.notFound(`No metrics for ${dateParam}`)
  }

  res.status(204).end()
})

adminRouter.get("/events", async (req, res) => {
  const query = parseInput(rangeQuerySchema, req.query)
  const where: Prisma.EventWhereInput = {}

  if (query.from !== undefined || query.to !== undefined) {
    const { from, to } = resolveRange(query.from, query.to)
    where.date = { gte: from, lte: to }
  }

  const rows = await prisma.event.findMany({
    where,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  })

  res.json({ events: rows.map(serializeEvent) })
})

adminRouter.post("/events", async (req, res) => {
  const body = parseInput(eventCreateSchema, req.body)

  const event = await prisma.event.create({
    data: {
      date: toUtcDate(body.date),
      type: body.type,
      title: body.title,
      description: body.description ?? null,
    },
  })

  res.status(201).json({ event: serializeEvent(event) })
})

adminRouter.patch("/events/:id", async (req, res) => {
  const body = parseInput(eventUpdateSchema, req.body)
  const id = req.params.id

  const existing = await prisma.event.findUnique({ where: { id } })
  if (existing === null) {
    throw ApiError.notFound("Event not found")
  }

  const data: Prisma.EventUpdateInput = {}
  if (body.date !== undefined) data.date = toUtcDate(body.date)
  if (body.type !== undefined) data.type = body.type
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description

  const event = await prisma.event.update({ where: { id }, data })
  res.json({ event: serializeEvent(event) })
})

adminRouter.delete("/events/:id", async (req, res) => {
  const { count } = await prisma.event.deleteMany({
    where: { id: req.params.id },
  })

  if (count === 0) {
    throw ApiError.notFound("Event not found")
  }

  res.status(204).end()
})
