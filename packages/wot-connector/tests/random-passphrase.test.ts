import { afterEach, describe, it, expect, vi } from "vitest"

import { generateRandomPassphrase } from "../src/random-passphrase.js"

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
// chars.length = 70 → limit = 256 - (256 % 70) = 210. Bytes >= 210 must be rejected.
const LIMIT = 210

afterEach(() => {
  vi.restoreAllMocks()
})

describe("generateRandomPassphrase", () => {
  it("returns a 32-character passphrase from the expected charset", () => {
    const pass = generateRandomPassphrase()
    expect(pass).toHaveLength(32)
    expect([...pass].every((c) => CHARS.includes(c))).toBe(true)
  })

  it("discards bytes >= the rejection limit and refills until full (no modulo bias)", () => {
    let call = 0
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((arr: any) => {
      if (call === 0) {
        arr.fill(255) // all >= LIMIT → every byte rejected on the first pass
      } else {
        for (let i = 0; i < arr.length; i++) arr[i] = i // 0..n, all < LIMIT → all accepted
      }
      call++
      return arr
    })

    const pass = generateRandomPassphrase()

    expect(pass).toHaveLength(32)
    // The first 32-byte batch was entirely rejected, forcing a second fetch.
    expect(spy).toHaveBeenCalledTimes(2)
    // Accepted bytes were 0..31 → chars[0..31] (all < chars.length so no wrap).
    expect(pass).toBe(CHARS.slice(0, 32))
  })

  it("accepts the boundary byte just below the limit", () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((arr: any) => {
      arr.fill(LIMIT - 1) // 209 < limit → accepted; 209 % 70 = 69 → last char
      return arr
    })
    const pass = generateRandomPassphrase()
    expect(pass).toBe(CHARS[(LIMIT - 1) % CHARS.length].repeat(32))
  })
})
