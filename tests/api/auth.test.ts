import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import { prisma } from "../../src/lib/prisma.js"
import { authTestHooks } from "../../src/routes/auth.js"
import { TEST_ADMIN, createAdmin, resetDb } from "../helpers.js"

const app = createApp()

beforeEach(async () => {
  await resetDb()
  await createAdmin()
  // The limiter is in memory and keyed on the socket address, which every
  // request in this file shares.
  authTestHooks.clearLoginLimiter()
})

describe("POST /api/auth/login", () => {
  it("sets a session cookie and returns the user", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.name,
    })
    const cookies = String(response.headers["set-cookie"])
    expect(cookies).toContain("session=")
    expect(cookies).toContain("HttpOnly")
    expect(await prisma.session.count()).toBe(1)
  })

  it("rejects a wrong password with 401", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN.email, password: "wrong" })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS")
  })

  it("rejects an invalid payload with 422", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("blocks further attempts after too many failures, then recovers", async () => {
    const attempt = () =>
      request(app)
        .post("/api/auth/login")
        .send({ email: TEST_ADMIN.email, password: "wrong" })

    // The limit is 5 by default; each failure is a 401 until it is used up.
    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(401)
    }

    const blocked = await attempt()
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS")
    expect(blocked.headers["retry-after"]).toBeDefined()

    // A correct password cannot get past an exhausted window either.
    const correct = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(correct.status).toBe(429)
  })

  it("ignores a forged X-Forwarded-For when no proxy is trusted", async () => {
    const attempt = (forwarded: string) =>
      request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", forwarded)
        .send({ email: TEST_ADMIN.email, password: "wrong" })

    for (let i = 0; i < 5; i += 1) {
      expect((await attempt(`198.51.100.${i}`)).status).toBe(401)
    }

    // Changing the header does not grant a fresh window.
    expect((await attempt("198.51.100.250")).status).toBe(429)
  })
})

describe("GET /api/auth/me", () => {
  it("returns 401 without a session", async () => {
    const response = await request(app).get("/api/auth/me")
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 for an unknown token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "session=not-a-real-token")

    expect(response.status).toBe(401)
  })

  it("returns the user with a session", async () => {
    const agent = request.agent(app)
    await agent
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })

    const response = await agent.get("/api/auth/me")
    expect(response.status).toBe(200)
    expect(response.body.user.email).toBe(TEST_ADMIN.email)
  })
})

describe("POST /api/auth/logout", () => {
  it("deletes the session and clears the cookie", async () => {
    const agent = request.agent(app)
    await agent
      .post("/api/auth/login")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(await prisma.session.count()).toBe(1)

    const logout = await agent.post("/api/auth/logout")
    expect(logout.status).toBe(204)
    expect(await prisma.session.count()).toBe(0)

    const me = await agent.get("/api/auth/me")
    expect(me.status).toBe(401)
  })
})
