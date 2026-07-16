import { describe, it, expect, vi } from "vitest"
import type { Item, Observable } from "@real-life-stack/data-interface"
import { createObservable } from "@real-life-stack/data-interface"

/**
 * Tests for profile reactivity in WotConnector.
 *
 * The connector maintains:
 * - profileObs: Observable<Item | null> — fires when PersonalDoc.profile changes
 * - syncPendingObs: Observable<boolean> — true while publishing to discovery
 *
 * Since WotConnector is complex to instantiate, these tests validate
 * the reactivity patterns in isolation using the same building blocks.
 */

// Simulate the PersonalDoc profile structure
interface PersonalDocProfile {
  name: string | null
  bio: string | null
  avatar: string | null
  createdAt: string
  updatedAt: string
}

// Simulate the connector's profile sync logic
function createProfileReactivity(did: string) {
  const profileObs = createObservable<Item | null>(null)
  const syncPendingObs = createObservable<boolean>(false)
  const listeners: (() => void)[] = []
  let currentProfile: PersonalDocProfile | null = null
  let lastProfileKey = ""

  // Simulates onYjsPersonalDocChange subscription
  const onPersonalDocChange = (cb: () => void) => {
    listeners.push(cb)
    return () => {
      const idx = listeners.indexOf(cb)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }

  const notifyPersonalDocChange = () => {
    for (const cb of listeners) cb()
  }

  // Simulates changeYjsPersonalDoc
  const changeProfile = (updates: Partial<PersonalDocProfile>) => {
    const now = new Date().toISOString()
    currentProfile = {
      name: currentProfile?.name ?? null,
      bio: currentProfile?.bio ?? null,
      avatar: currentProfile?.avatar ?? null,
      createdAt: currentProfile?.createdAt ?? now,
      updatedAt: now,
      ...updates,
    }
    // Fire all listeners (simulates Yjs doc change event)
    notifyPersonalDocChange()
  }

  // This mirrors WotConnector's bootstrapAdapters profile subscription
  const profileUnsub = onPersonalDocChange(() => {
    const key = JSON.stringify(currentProfile ?? null)
    if (key !== lastProfileKey) {
      lastProfileKey = key
      syncProfileObservable()
    }
  })

  // This mirrors WotConnector's syncProfileObservable
  function syncProfileObservable() {
    if (!currentProfile) {
      profileObs.set(null)
      return
    }
    profileObs.set({
      id: did,
      type: "person",
      createdAt: currentProfile.createdAt,
      createdBy: did,
      data: {
        name: currentProfile.name ?? did.slice(0, 12),
        bio: currentProfile.bio ?? undefined,
        avatar: currentProfile.avatar ?? undefined,
      },
    })
  }

  // Initial sync
  syncProfileObservable()

  return {
    profileObs,
    syncPendingObs,
    changeProfile,
    notifyPersonalDocChange,
    cleanup: profileUnsub,
  }
}

describe("Profile Reactivity — observeMyProfile()", () => {
  const DID = "did:key:z6MkTest"

  it("initially returns null when no profile exists", () => {
    const { profileObs } = createProfileReactivity(DID)
    expect(profileObs.current).toBeNull()
  })

  it("fires when profile is created", () => {
    const { profileObs, changeProfile } = createProfileReactivity(DID)
    const updates: (Item | null)[] = []
    profileObs.subscribe((p) => updates.push(p))

    changeProfile({ name: "Anton" })

    expect(updates).toHaveLength(1)
    expect(updates[0]?.data.name).toBe("Anton")
  })

  it("fires when profile name changes", () => {
    const { profileObs, changeProfile } = createProfileReactivity(DID)
    changeProfile({ name: "Anton" })

    const updates: (Item | null)[] = []
    profileObs.subscribe((p) => updates.push(p))

    changeProfile({ name: "Anton T." })

    expect(updates).toHaveLength(1)
    expect(updates[0]?.data.name).toBe("Anton T.")
  })

  it("fires when bio or avatar changes", () => {
    const { profileObs, changeProfile } = createProfileReactivity(DID)
    changeProfile({ name: "Anton" })

    const updates: (Item | null)[] = []
    profileObs.subscribe((p) => updates.push(p))

    changeProfile({ bio: "Builder of trust" })

    expect(updates).toHaveLength(1)
    expect(updates[0]?.data.bio).toBe("Builder of trust")

    changeProfile({ avatar: "ipfs://QmAbc" })

    expect(updates).toHaveLength(2)
    expect(updates[1]?.data.avatar).toBe("ipfs://QmAbc")
  })

  it("does NOT fire when profile is unchanged", () => {
    const { profileObs, changeProfile, notifyPersonalDocChange } = createProfileReactivity(DID)
    changeProfile({ name: "Anton", bio: "Hello" })

    const updates: (Item | null)[] = []
    profileObs.subscribe((p) => updates.push(p))

    // Simulate a PersonalDoc change that doesn't touch profile
    // (e.g. contact added — in real code, onYjsPersonalDocChange fires for any change)
    notifyPersonalDocChange()

    expect(updates).toHaveLength(0)
  })

  it("observable.current reflects latest profile", () => {
    const { profileObs, changeProfile } = createProfileReactivity(DID)

    changeProfile({ name: "First" })
    expect(profileObs.current?.data.name).toBe("First")

    changeProfile({ name: "Second" })
    expect(profileObs.current?.data.name).toBe("Second")
  })

  it("profile Item has correct structure", () => {
    const { profileObs, changeProfile } = createProfileReactivity(DID)

    changeProfile({ name: "Anton", bio: "Dev", avatar: "pic.jpg" })

    const profile = profileObs.current
    expect(profile).not.toBeNull()
    expect(profile!.id).toBe(DID)
    expect(profile!.type).toBe("person")
    expect(profile!.createdBy).toBe(DID)
    expect(profile!.data.name).toBe("Anton")
    expect(profile!.data.bio).toBe("Dev")
    expect(profile!.data.avatar).toBe("pic.jpg")
    expect(typeof profile!.createdAt).toBe("string")
  })
})

describe("Profile Reactivity — isProfileSyncPending()", () => {
  it("is initially false", () => {
    const { syncPendingObs } = createProfileReactivity("did:key:z6MkTest")
    expect(syncPendingObs.current).toBe(false)
  })

  it("tracks sync lifecycle", async () => {
    const { syncPendingObs } = createProfileReactivity("did:key:z6MkTest")
    const states: boolean[] = []
    syncPendingObs.subscribe((v) => states.push(v))

    // Simulate what syncProfile() does
    syncPendingObs.set(true)
    // ... publish happens ...
    syncPendingObs.set(false)

    expect(states).toEqual([true, false])
  })
})
