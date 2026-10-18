import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const healthRouter = Router()

healthRouter.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: "ok", database: "up" })
})
