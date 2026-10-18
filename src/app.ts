import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import { env } from "./config/env.js"
import { errorHandler, notFoundHandler } from "./middleware/error.js"
import { authRouter } from "./routes/auth.js"
import { dashboardRouter } from "./routes/dashboard.js"
import { healthRouter } from "./routes/health.js"

export function createApp(): express.Express {
  const app = express()

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  )
  app.use(express.json())
  app.use(cookieParser())

  app.use(healthRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/dashboard", dashboardRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
