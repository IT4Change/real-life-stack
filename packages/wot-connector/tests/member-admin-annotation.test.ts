import { describe, it, expect, vi } from "vitest"
import { WotConnector } from "../src/wot-connector.js"
import type { User } from "@real-life-stack/data-interface"

/**
 * Regression for the "wrong person shown as Admin" bug: the group dialog derived
 * the Admin badge (and creator controls) from `members[0]`, but `space.members`
 * is sorted ALPHABETICALLY by DID (wot-core resolveActiveMembers -> active.sort()).
 * So the alphabetically-smallest DID was labelled Admin regardless of who created
 * the space. getMembers must instead annotate each member with `isAdmin` from the
 * authoritative admin set (`space.admins`, fallback `createdBy`, then members[0]).
 */

// Anton's real case: members sorted alphabetically (Daniel < Timo < Anton),
// but Anton is the actual creator/admin.
const DANIEL = "did:key:z6MknkqFkqBtLtnoMVLSh6FShmyHocD8rJgmYepXZGBj3QQz"
const TIMO = "did:key:z6MkttnkimUuBXvuzCaV9Xj7CCwZE6t19AdNu9JTMMZNowEs"
const ANTON = "did:key:z6MktzHcBmKRFLhy6iqvMhXB1s1XZ17tUXvPEaWRzTD7nSAe"

function connectorWithSpace(space: Record<string, unknown>): WotConnector {
  const value = Object.create(WotConnector.prototype) as unknown as {
    replication: unknown
    getUser: (did: string) => Promise<User | null>
    getMembers: (groupId: string | null) => Promise<User[]>
  }
  value.replication = {
    getSpace: vi.fn(async () => space),
    getSpaces: vi.fn(async () => [space]),
  }
  value.getUser = vi.fn(async (did: string) => ({ id: did, displayName: did.slice(-4) }))
  return value as unknown as WotConnector
}

describe("getMembers admin annotation", () => {
  it("marks the space creator as admin, not the alphabetically-first member", async () => {
    const c = connectorWithSpace({
      id: "g1",
      type: "shared",
      members: [DANIEL, TIMO, ANTON], // as wot-core returns them: DID-sorted
      createdBy: ANTON,
      admins: [ANTON],
      createdAt: "2026-07-24T00:00:00.000Z",
    })

    const members = await c.getMembers("g1")
    const admin = (m: User) => m.isAdmin === true

    expect(members.filter(admin).map((m) => m.id)).toEqual([ANTON])
    // The alphabetically-first member (members[0]) must NOT be flagged admin.
    expect(members.find((m) => m.id === DANIEL)?.isAdmin ?? false).toBe(false)
  })

  it("supports multiple admins from space.admins", async () => {
    const c = connectorWithSpace({
      id: "g2", type: "shared",
      members: [DANIEL, TIMO, ANTON], createdBy: ANTON, admins: [ANTON, TIMO],
      createdAt: "2026-07-24T00:00:00.000Z",
    })
    const admins = (await c.getMembers("g2")).filter((m) => m.isAdmin).map((m) => m.id).sort()
    expect(admins).toEqual([ANTON, TIMO].sort())
  })

  it("falls back to createdBy when admins is absent/empty", async () => {
    const c = connectorWithSpace({
      id: "g3", type: "shared",
      members: [DANIEL, ANTON], createdBy: ANTON, admins: [],
      createdAt: "2026-07-24T00:00:00.000Z",
    })
    const admins = (await c.getMembers("g3")).filter((m) => m.isAdmin).map((m) => m.id)
    expect(admins).toEqual([ANTON])
  })

  it("falls back to members[0] for legacy spaces without admins or createdBy", async () => {
    const c = connectorWithSpace({
      id: "g4", type: "shared",
      members: [DANIEL, ANTON], createdAt: "2026-07-24T00:00:00.000Z",
    })
    const admins = (await c.getMembers("g4")).filter((m) => m.isAdmin).map((m) => m.id)
    expect(admins).toEqual([DANIEL]) // preserved legacy behavior when no better signal exists
  })
})
