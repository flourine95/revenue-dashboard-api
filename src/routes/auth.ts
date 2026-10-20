import { Router } from "express"
import { z } from "zod"
import { env } from "../config/env.js"
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  sessionCookieOptions,
  verifyPassword,
} from "../lib/auth.js"
import { prisma } from "../lib/prisma.js"
import { parseInput } from "../lib/validation.js"
import { readSessionToken, requireAuth } from "../middleware/auth.js"
import { ApiError } from "../middleware/error.js"
import { createLoginRateLimiter } from "../middleware/rate-limit.js"

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required"),
})

const loginLimiter = createLoginRateLimiter({
  maxAttempts: env.LOGIN_MAX_ATTEMPTS,
  windowMs: env.LOGIN_WINDOW_MINUTES * 60 * 1000,
  trustProxy: env.TRUST_PROXY,
})

export const authRouter = Router()

/** Exposed so tests can isolate the shared in-memory counters. */
export const authTestHooks = { clearLoginLimiter: () => loginLimiter.clear() }

authRouter.post("/login", loginLimiter.guard, async (req, res) => {
  const { email, password } = parseInput(loginSchema, req.body)

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  })
  if (user === null || !(await verifyPassword(password, user.passwordHash))) {
    loginLimiter.recordFailure(req)
    // Deliberately the same error whether the email or the password failed.
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect"
    )
  }

  loginLimiter.reset(req)
  const { token, maxAge } = await createSession(user.id)
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
  res.json({ user: { id: user.id, email: user.email, name: user.name } })
})

authRouter.post("/logout", async (req, res) => {
  const token = readSessionToken(req)
  if (token !== undefined) {
    await deleteSession(token)
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions())
  res.status(204).end()
})

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user })
})
