import type { AuthUser } from "../lib/auth.js"

declare global {
  namespace Express {
    interface Request {
      /** Set by the requireAuth middleware after a valid session lookup. */
      user?: AuthUser
      sessionId?: string
    }
  }
}
