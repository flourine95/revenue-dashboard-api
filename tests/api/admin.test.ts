import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import { prisma } from "../../src/lib/prisma.js"
import { TEST_ADMIN, createAdmin, resetDb } from "../helpers.js"

const app = createApp()

let agent: ReturnType<typeof request.agent>

beforeEach(async () => {
  await resetDb()
  await createAdmin()
  agent = request.agent(app)
  await agent
    .post("/api/auth/login")
    .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
})

describe("admin auth guard", () => {
  it("rejects unauthenticated access", async () => {
    expect((await request(app).get("/api/admin/metrics")).status).toBe(401)
    expect((await request(app).get("/api/admin/events")).status).toBe(401)
    expect((await request(app).delete("/api/admin/events/x")).status).toBe(401)
  })
})

describe("PUT /api/admin/metrics/:date", () => {
  it("creates a day and then updates it", async () => {
    const created = await agent.put("/api/admin/metrics/2026-10-15").send({
      posRevenue: 100.5,
      eatclubRevenue: 20.25,
      labourCost: 30,
      covers: 12,
    })

    expect(created.status).toBe(200)
    expect(created.body.metric).toEqual({
      date: "2026-10-15",
      posRevenue: 100.5,
      eatclubRevenue: 20.25,
      labourCost: 30,
      covers: 12,
    })

    const updated = await agent.put("/api/admin/metrics/2026-10-15").send({
      posRevenue: 1,
      eatclubRevenue: 0,
      labourCost: 0,
      covers: 1,
    })

    expect(updated.status).toBe(200)
    expect(updated.body.metric.posRevenue).toBe(1)
    expect(await prisma.dailyMetric.count()).toBe(1)
  })

  it("validates the payload", async () => {
    const response = await agent.put("/api/admin/metrics/2026-10-15").send({
      posRevenue: -1,
      eatclubRevenue: 0,
      labourCost: 0,
      covers: 1.5,
    })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
  })
})

describe("GET and DELETE /api/admin/metrics", () => {
  it("lists and deletes a day", async () => {
    await agent.put("/api/admin/metrics/2026-10-15").send({
      posRevenue: 10,
      eatclubRevenue: 0,
      labourCost: 0,
      covers: 1,
    })

    const list = await agent.get(
      "/api/admin/metrics?from=2026-10-12&to=2026-10-18"
    )
    expect(list.status).toBe(200)
    expect(list.body.metrics).toHaveLength(1)
    expect(list.body.metrics[0].date).toBe("2026-10-15")

    expect((await agent.delete("/api/admin/metrics/2026-10-15")).status).toBe(
      204
    )
    expect((await agent.delete("/api/admin/metrics/2026-10-15")).status).toBe(
      404
    )
  })
})

describe("events CRUD", () => {
  it("creates, patches, lists and deletes an event", async () => {
    const created = await agent.post("/api/admin/events").send({
      date: "2026-10-14",
      type: "positive",
      title: "  Big catering order  ",
    })

    expect(created.status).toBe(201)
    expect(created.body.event.title).toBe("Big catering order")
    const id = created.body.event.id as string

    const patched = await agent.patch(`/api/admin/events/${id}`).send({
      type: "negative",
      description: "Customer complained",
    })
    expect(patched.status).toBe(200)
    expect(patched.body.event).toMatchObject({
      date: "2026-10-14",
      type: "negative",
      description: "Customer complained",
    })

    const list = await agent.get("/api/admin/events")
    expect(list.body.events).toHaveLength(1)

    expect((await agent.delete(`/api/admin/events/${id}`)).status).toBe(204)
    expect((await agent.delete(`/api/admin/events/${id}`)).status).toBe(404)
  })

  it("validates the event payload", async () => {
    const response = await agent
      .post("/api/admin/events")
      .send({ date: "2026-10-14", type: "neutral", title: "" })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("returns 404 when patching a missing event", async () => {
    const response = await agent
      .patch("/api/admin/events/missing")
      .send({ title: "x" })

    expect(response.status).toBe(404)
  })
})
