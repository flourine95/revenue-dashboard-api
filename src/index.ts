import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { prisma } from "./lib/prisma.js"

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`Revenue dashboard API listening on http://localhost:${env.PORT}`)
})

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`)
  server.close(() => {
    void prisma.$disconnect().finally(() => {
      process.exit(0)
    })
  })
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
