import { describe, it, expect } from "vitest"
import { resolveAdminView } from "../src/lib/group-admin-view"
import type { User } from "@real-life-stack/data-interface"

const u = (id: string, isAdmin?: boolean): User =>
  isAdmin === undefined ? { id } : { id, isAdmin }

describe("resolveAdminView", () => {
  describe("annotated mode (connector sets isAdmin)", () => {
    // Members are DID-sorted, so members[0] is NOT the admin here.
    const members = [u("did:daniel", false), u("did:timo", false), u("did:anton", true)]

    it("drives the badge from isAdmin, not position", () => {
      const { annotated, isAdmin } = resolveAdminView(members, "did:anton")
      expect(annotated).toBe(true)
      expect(isAdmin(members[0])).toBe(false) // members[0] (did:daniel) is not admin
      expect(isAdmin(members[2])).toBe(true) // did:anton is
    })

    it("reports currentUserIsAdmin from the annotation", () => {
      expect(resolveAdminView(members, "did:anton").currentUserIsAdmin).toBe(true)
      expect(resolveAdminView(members, "did:daniel").currentUserIsAdmin).toBe(false)
    })

    it("treats a single annotated member as authoritative for the whole list", () => {
      // Only one member carries the flag; the rest default to non-admin.
      const partial = [u("did:x"), u("did:y", true)]
      const { annotated, isAdmin } = resolveAdminView(partial, "did:x")
      expect(annotated).toBe(true)
      expect(isAdmin(partial[0])).toBe(false)
      expect(isAdmin(partial[1])).toBe(true)
    })
  })

  describe("legacy mode (connector does not annotate)", () => {
    // Local/Mock/GraphQL connectors return plain User objects without isAdmin.
    const members = [u("did:first"), u("did:second"), u("did:third")]

    it("falls back to members[0] for the badge", () => {
      const { annotated, isAdmin } = resolveAdminView(members, "did:first")
      expect(annotated).toBe(false)
      expect(isAdmin(members[0])).toBe(true)
      expect(isAdmin(members[1])).toBe(false)
    })

    it("keeps members[0] as the admin for controls", () => {
      expect(resolveAdminView(members, "did:first").currentUserIsAdmin).toBe(true)
      expect(resolveAdminView(members, "did:second").currentUserIsAdmin).toBe(false)
    })

    it("is admin-less for an empty member list", () => {
      const { currentUserIsAdmin } = resolveAdminView([], "did:first")
      expect(currentUserIsAdmin).toBe(false)
    })
  })
})
