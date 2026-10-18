import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import { prisma } from "../../src/lib/prisma.js"
import { TEST_ADMIN, createAdmin, resetDb } from "../helpers.js"

const app = createApp()

beforeEach(async () => {
  await resetDb()
  await createAdmin()
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
