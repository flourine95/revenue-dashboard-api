import type { NextFunction, Request, Response } from "express"
import { SESSION_COOKIE, resolveSession } from "../lib/auth.js"
import { ApiError } from "./error.js"

export function readSessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined
  const token = cookies?.[SESSION_COOKIE]
  return typeof token === "string" && token.length > 0 ? token : undefined
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = readSessionToken(req)
  const session = token === undefined ? null : await resolveSession(token)

  if (session === null) {
    throw ApiError.unauthorized()
  }

  req.user = session.user
  req.sessionId = session.sessionId
  // Express 5 forwards rejections but does not continue the chain by itself.
  next()
}
