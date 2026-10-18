import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const healthRouter = Router()

/**
 * GET /health — liveness/readiness probe used by the README setup check
 * and by the frontend dev workflow. Verifies the database round-trip.
 */
healthRouter.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: "ok", database: "up" })
})
