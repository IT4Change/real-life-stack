import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTraceLog } from "@real-life/wot-core"

import { traceReceptionDrop } from "../src/reception-trace.js"

describe("traceReceptionDrop (rls#219 — stille Drops sichtbar)", () => {
  beforeEach(() => {
    getTraceLog().clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("schreibt Warnung UND Trace-Eintrag mit Grund", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    traceReceptionDrop("incoming attestation rejected", "invalid-vc-jws: Signatur ungültig", { senderDid: "did:key:zpeer" })

    expect(warn).toHaveBeenCalledWith(
      "[wot-connector] incoming attestation rejected:",
      "invalid-vc-jws: Signatur ungültig",
    )
    const entries = getTraceLog().getAll({ success: false })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      store: "relay",
      operation: "receive",
      label: "incoming attestation rejected: invalid-vc-jws: Signatur ungültig",
      success: false,
      error: "invalid-vc-jws: Signatur ungültig",
      meta: { senderDid: "did:key:zpeer" },
    })
  })

  it("bricht nie den Empfangspfad, auch wenn das Tracing wirft", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(getTraceLog(), "log").mockImplementation(() => {
      throw new Error("trace kaputt")
    })
    expect(() => traceReceptionDrop("x", "y")).not.toThrow()
  })
})
