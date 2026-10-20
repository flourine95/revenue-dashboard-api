import { describe, expect, it } from "vitest"
import { createLoginRateLimiter } from "../../src/middleware/rate-limit.js"

function fakeReq(ip = "127.0.0.1", forwarded?: string) {
  return {
    ip,
    get: (name: string) =>
      name.toLowerCase() === "x-forwarded-for" ? forwarded : undefined,
  }
}

function fakeRes() {
  const headers: Record<string, string> = {}
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
    },
  }
}

describe("createLoginRateLimiter", () => {
  it("allows attempts up to the limit and refuses the next one", () => {
    let clock = 0
    const limiter = createLoginRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
      now: () => clock,
    })
    const req = fakeReq()

    for (let i = 0; i < 3; i += 1) {
      const res = fakeRes()
      expect(() =>
        limiter.guard(req as never, res as never, () => {})
      ).not.toThrow()
      limiter.recordFailure(req as never)
    }

    const blocked = fakeRes()
    expect(() =>
      limiter.guard(req as never, blocked as never, () => {})
    ).toThrow(/Too many failed sign-in attempts/)
    expect(blocked.headers["retry-after"]).toBeDefined()
  })

  it("lets the client back in once the window has passed", () => {
    let clock = 0
    const limiter = createLoginRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
      now: () => clock,
    })
    const req = fakeReq()

    limiter.guard(req as never, fakeRes() as never, () => {})
    limiter.recordFailure(req as never)
    expect(() =>
      limiter.guard(req as never, fakeRes() as never, () => {})
    ).toThrow()

    clock = 60_000
    expect(() =>
      limiter.guard(req as never, fakeRes() as never, () => {})
    ).not.toThrow()
  })

  it("a successful login clears the counter", () => {
    let clock = 0
    const limiter = createLoginRateLimiter({
      maxAttempts: 2,
      windowMs: 60_000,
      now: () => clock,
    })
    const req = fakeReq()

    limiter.guard(req as never, fakeRes() as never, () => {})
    limiter.recordFailure(req as never)
    limiter.reset(req as never)

    limiter.guard(req as never, fakeRes() as never, () => {})
    limiter.recordFailure(req as never)
    expect(() =>
      limiter.guard(req as never, fakeRes() as never, () => {})
    ).not.toThrow()
  })

  it("tracks clients independently and honours X-Forwarded-For", () => {
    const limiter = createLoginRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
      now: () => 0,
    })
    const first = fakeReq("10.0.0.1")
    const second = fakeReq("10.0.0.2", "203.0.113.9, 10.0.0.1")

    limiter.guard(first as never, fakeRes() as never, () => {})
    limiter.recordFailure(first as never)

    expect(() =>
      limiter.guard(first as never, fakeRes() as never, () => {})
    ).toThrow()
    expect(() =>
      limiter.guard(second as never, fakeRes() as never, () => {})
    ).not.toThrow()
  })
})
