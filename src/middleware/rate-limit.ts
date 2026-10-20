import type { NextFunction, Request, Response } from "express"
import { ApiError } from "./error.js"

type Attempt = { failures: number; windowStart: number }

/**
 * Bounds repeated login attempts from one client.
 *
 * A successful login clears the counter. Failed logins accumulate inside a
 * fixed window; once the limit is reached every further attempt is refused
 * until the window expires. State is in memory, which is enough for a single
 * API instance and keeps the demo free of another dependency; a multi-instance
 * deployment would move the same counters to Redis.
 */
export function createLoginRateLimiter({
  maxAttempts,
  windowMs,
  trustProxy = false,
  now = () => Date.now(),
}: {
  maxAttempts: number
  windowMs: number
  /**
   * Read the client address from `X-Forwarded-For`. Only enable this when a
   * proxy you control sets that header: a client can forge it otherwise, which
   * both evades the limit and lets an attacker lock out someone else's address.
   */
  trustProxy?: boolean
  now?: () => number
}) {
  const attempts = new Map<string, Attempt>()

  function key(req: Request): string {
    if (trustProxy) {
      const forwarded = req.get("x-forwarded-for")
      if (forwarded !== undefined && forwarded.length > 0) {
        return forwarded.split(",")[0]?.trim() ?? req.ip ?? "unknown"
      }
    }
    return req.ip ?? "unknown"
  }

  function current(req: Request): Attempt {
    const id = key(req)
    const existing = attempts.get(id)
    if (existing === undefined || now() - existing.windowStart >= windowMs) {
      const fresh = { failures: 0, windowStart: now() }
      attempts.set(id, fresh)
      return fresh
    }
    return existing
  }

  /** Refuses the request once the client has used up its attempts. */
  function guard(req: Request, res: Response, next: NextFunction): void {
    const attempt = current(req)
    const elapsed = now() - attempt.windowStart
    const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000))

    if (attempt.failures >= maxAttempts) {
      res.setHeader("Retry-After", String(retryAfter))
      throw ApiError.tooManyRequests(
        `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`
      )
    }

    next()
  }

  return {
    guard,
    /** Called after a rejected login. */
    recordFailure(req: Request): void {
      current(req).failures += 1
    },
    /** Called after a successful login so the window resets. */
    reset(req: Request): void {
      attempts.delete(key(req))
    },
    /** Drops every counter. Used by tests that share one client address. */
    clear(): void {
      attempts.clear()
    },
  }
}

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>
