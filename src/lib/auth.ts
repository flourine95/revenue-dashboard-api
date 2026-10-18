import { createHash, randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import type { CookieOptions } from "express"
import { env } from "../config/env.js"
import { prisma } from "./prisma.js"

export const SESSION_COOKIE = "session"

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type AuthUser = {
  id: string
  email: string
  name: string
}

export type AuthSession = {
  user: AuthUser
  sessionId: string
}

/** Only the hash of a session token is stored; the raw token stays in the cookie. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

export async function createSession(userId: string): Promise<{
  token: string
  maxAge: number
}> {
  const token = randomBytes(32).toString("base64url")
  const maxAge = env.SESSION_TTL_DAYS * MS_PER_DAY

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + maxAge),
    },
  })

  return { token, maxAge }
}

export async function resolveSession(
  token: string
): Promise<AuthSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  if (session === null) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    // Clean up expired sessions as we run into them.
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return { user: session.user, sessionId: session.id }
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

export function sessionCookieOptions(maxAge?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  }
  if (maxAge !== undefined) {
    options.maxAge = maxAge
  }
  return options
}
