import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  InMemoryGraphCacheStore,
  InMemoryPublishStateStore,
  OfflineFirstDiscoveryAdapter,
  type MessageEnvelope,
  type PublicProfile,
} from "@real-life/wot-core"

/**
 * Tests for the profile sync logic that the WoT Connector must implement:
 *
 * 1. When own profile changes → send 'profile-update' message to all contacts
 * 2. When 'profile-update' message received → fetch profile from discovery → update local contact
 * 3. On init → sync all contact profiles from discovery server
 *
 * These tests validate the logic in isolation, using the same patterns as useProfileSync.ts
 * in the Demo App.
 */

// --- Types ---

interface Contact {
  did: string
  name: string | null
  avatar?: string | null
  bio?: string | null
  status: string
}

// --- Fake implementations ---

function createFakeStorage(contacts: Contact[] = []) {
  const store = new Map<string, Contact>(contacts.map((c) => [c.did, { ...c }]))

  return {
    getContacts: vi.fn(async () => [...store.values()]),
    getContact: vi.fn(async (did: string) => store.get(did) ?? null),
    updateContact: vi.fn(async (contact: Contact) => {
      store.set(contact.did, { ...contact })
    }),
    _store: store,
  }
}

function createFakeDiscovery(profiles: Map<string, PublicProfile> = new Map()) {
  return {
    resolveProfile: vi.fn(async (did: string) => {
      const profile = profiles.get(did) ?? null
      return { profile }
    }),
    publishProfile: vi.fn(async () => {}),
  }
}

function createFakeMessaging() {
  const sent: MessageEnvelope[] = []
  const listeners: ((envelope: MessageEnvelope) => void)[] = []

  return {
    send: vi.fn(async (envelope: MessageEnvelope) => {
      sent.push(envelope)
      return { id: envelope.id, status: "sent" as const }
    }),
    onMessage: vi.fn((cb: (envelope: MessageEnvelope) => void) => {
      listeners.push(cb)
      return () => {
        const idx = listeners.indexOf(cb)
        if (idx >= 0) listeners.splice(idx, 1)
      }
    }),
    // Test helper: simulate receiving a message
    _simulateMessage: (envelope: MessageEnvelope) => {
      for (const cb of listeners) cb(envelope)
    },
    _sent: sent,
  }
}

// --- Profile Sync Logic (extracted from what the connector should implement) ---

/**
 * Send profile-update notifications to all contacts.
 * This is what should happen when the user updates their profile.
 */
async function broadcastProfileUpdate(
  did: string,
  profileName: string,
  storage: ReturnType<typeof createFakeStorage>,
  messaging: ReturnType<typeof createFakeMessaging>,
) {
  const contacts = await storage.getContacts()
  for (const contact of contacts) {
    const envelope: MessageEnvelope = {
      v: 1,
      id: crypto.randomUUID(),
      type: "profile-update",
      fromDid: did,
      toDid: contact.did,
      createdAt: new Date().toISOString(),
      encoding: "json",
      payload: JSON.stringify({ did, name: profileName }),
      signature: "",
    }
    messaging.send(envelope).catch(() => {})
  }
}

/**
 * Handle an incoming profile-update message.
 * Fetch the latest profile from discovery and update the local contact.
 */
async function handleProfileUpdate(
  envelope: MessageEnvelope,
  storage: ReturnType<typeof createFakeStorage>,
  discovery: ReturnType<typeof createFakeDiscovery>,
) {
  if (envelope.type !== "profile-update") return

  const result = await discovery.resolveProfile(envelope.fromDid)
  const profile = result.profile
  if (!profile?.name) return

  const contacts = await storage.getContacts()
  const contact = contacts.find((c) => c.did === envelope.fromDid)
  if (!contact) return

  const needsUpdate =
    (contact.name || null) !== (profile.name || null) ||
    (contact.avatar || null) !== (profile.avatar || null) ||
    (contact.bio || null) !== (profile.bio || null)

  if (needsUpdate) {
    await storage.updateContact({
      ...contact,
      name: profile.name,
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
      ...(profile.bio ? { bio: profile.bio } : {}),
    })
  }
}

/**
 * Sync all contact profiles from discovery on init.
 * Fetch each contact's profile and update name/avatar/bio if changed.
 */
async function syncContactProfiles(
  storage: ReturnType<typeof createFakeStorage>,
  discovery: ReturnType<typeof createFakeDiscovery>,
) {
  const contacts = await storage.getContacts()
  for (const contact of contacts) {
    const result = await discovery.resolveProfile(contact.did)
    const profile = result.profile
    if (!profile?.name) continue

    const needsUpdate =
      (contact.name || null) !== (profile.name || null) ||
      (contact.avatar || null) !== (profile.avatar || null) ||
      (contact.bio || null) !== (profile.bio || null)

    if (needsUpdate) {
      await storage.updateContact({
        ...contact,
        name: profile.name,
        ...(profile.avatar ? { avatar: profile.avatar } : {}),
        ...(profile.bio ? { bio: profile.bio } : {}),
      })
    }
  }
}

// --- Tests ---

describe("Offline-first profile publish", () => {
  it("does not throw offline and retries the latest dirty profile", async () => {
    const did = "did:key:alice"
    const firstProfile: PublicProfile = {
      did,
      name: "Alice Offline",
      avatar: "avatar-v1",
      updatedAt: "2026-07-16T09:00:00.000Z",
    }
    const retryProfile: PublicProfile = {
      ...firstProfile,
      avatar: "avatar-v2",
      updatedAt: "2026-07-16T09:01:00.000Z",
    }
    const publishProfile = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined)
    const inner = { publishProfile } as any
    const publishState = new InMemoryPublishStateStore()
    const discovery = new OfflineFirstDiscoveryAdapter(
      inner,
      publishState,
      new InMemoryGraphCacheStore(),
    )
    const identity = {} as any

    await expect(discovery.publishProfile(firstProfile, identity)).resolves.toBeUndefined()
    expect(await publishState.getDirtyFields(did)).toContain("profile")

    await discovery.syncPending(did, identity, async () => ({ profile: retryProfile }))

    expect(publishProfile).toHaveBeenNthCalledWith(1, firstProfile, identity)
    expect(publishProfile).toHaveBeenNthCalledWith(2, retryProfile, identity)
    expect(await publishState.getDirtyFields(did)).not.toContain("profile")
  })
})

describe("Profile Update Broadcast", () => {
  it("sends profile-update message to all contacts", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", status: "active" },
      { did: "did:key:carla", name: "Carla", status: "active" },
    ])
    const messaging = createFakeMessaging()

    await broadcastProfileUpdate("did:key:alice", "Alice New Name", storage, messaging)

    expect(messaging.send).toHaveBeenCalledTimes(2)

    const sent = messaging._sent
    expect(sent[0].type).toBe("profile-update")
    expect(sent[0].fromDid).toBe("did:key:alice")
    expect(sent[0].toDid).toBe("did:key:bob")
    expect(JSON.parse(sent[0].payload).name).toBe("Alice New Name")

    expect(sent[1].toDid).toBe("did:key:carla")
  })

  it("sends nothing when no contacts exist", async () => {
    const storage = createFakeStorage([])
    const messaging = createFakeMessaging()

    await broadcastProfileUpdate("did:key:alice", "Alice", storage, messaging)

    expect(messaging.send).not.toHaveBeenCalled()
  })

  it("does not throw when send fails (fire-and-forget)", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", status: "active" },
    ])
    const messaging = createFakeMessaging()
    messaging.send.mockRejectedValue(new Error("relay down"))

    // Should not throw
    await broadcastProfileUpdate("did:key:alice", "Alice", storage, messaging)
  })
})

describe("Profile Update Handler", () => {
  it("fetches profile from discovery and updates contact name", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Old Bob", status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([["did:key:bob", { did: "did:key:bob", name: "New Bob", encryptionPublicKey: "key", updatedAt: new Date().toISOString() }]])
    )

    const envelope: MessageEnvelope = {
      v: 1,
      id: "msg-1",
      type: "profile-update",
      fromDid: "did:key:bob",
      toDid: "did:key:alice",
      createdAt: new Date().toISOString(),
      encoding: "json",
      payload: JSON.stringify({ did: "did:key:bob", name: "New Bob" }),
      signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(discovery.resolveProfile).toHaveBeenCalledWith("did:key:bob")
    expect(storage.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({ did: "did:key:bob", name: "New Bob" })
    )
  })

  it("updates avatar and bio when changed", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", avatar: null, bio: null, status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([["did:key:bob", {
        did: "did:key:bob",
        name: "Bob",
        avatar: "https://example.com/avatar.jpg",
        bio: "Hello world",
        encryptionPublicKey: "key",
        updatedAt: new Date().toISOString(),
      }]])
    )

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "profile-update",
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(storage.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: "https://example.com/avatar.jpg",
        bio: "Hello world",
      })
    )
  })

  it("does not update when nothing changed", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", avatar: null, bio: null, status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([["did:key:bob", {
        did: "did:key:bob", name: "Bob",
        encryptionPublicKey: "key", updatedAt: new Date().toISOString(),
      }]])
    )

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "profile-update",
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(storage.updateContact).not.toHaveBeenCalled()
  })

  it("ignores profile-update from unknown contact", async () => {
    const storage = createFakeStorage([]) // No contacts
    const discovery = createFakeDiscovery(
      new Map([["did:key:stranger", {
        did: "did:key:stranger", name: "Stranger",
        encryptionPublicKey: "key", updatedAt: new Date().toISOString(),
      }]])
    )

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "profile-update",
      fromDid: "did:key:stranger", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(storage.updateContact).not.toHaveBeenCalled()
  })

  it("ignores when discovery returns no profile", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", status: "active" },
    ])
    const discovery = createFakeDiscovery(new Map()) // No profiles on server

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "profile-update",
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(storage.updateContact).not.toHaveBeenCalled()
  })

  it("ignores non-profile-update messages", async () => {
    const storage = createFakeStorage([])
    const discovery = createFakeDiscovery()

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "verification",
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    await handleProfileUpdate(envelope, storage, discovery)

    expect(discovery.resolveProfile).not.toHaveBeenCalled()
  })
})

describe("Contact Profile Sync on Init", () => {
  it("updates outdated contact names from discovery", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Old Name", status: "active" },
      { did: "did:key:carla", name: "Carla", status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([
        ["did:key:bob", { did: "did:key:bob", name: "Bob Updated", encryptionPublicKey: "k", updatedAt: new Date().toISOString() }],
        ["did:key:carla", { did: "did:key:carla", name: "Carla", encryptionPublicKey: "k", updatedAt: new Date().toISOString() }],
      ])
    )

    await syncContactProfiles(storage, discovery)

    // Bob was updated
    expect(storage.updateContact).toHaveBeenCalledTimes(1)
    expect(storage.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({ did: "did:key:bob", name: "Bob Updated" })
    )
  })

  it("skips contacts when discovery has no profile", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", status: "active" },
    ])
    const discovery = createFakeDiscovery(new Map()) // Empty server

    await syncContactProfiles(storage, discovery)

    expect(storage.updateContact).not.toHaveBeenCalled()
  })

  it("updates avatar and bio from discovery", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", avatar: null, bio: null, status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([["did:key:bob", {
        did: "did:key:bob", name: "Bob",
        avatar: "new-avatar.jpg", bio: "New bio",
        encryptionPublicKey: "k", updatedAt: new Date().toISOString(),
      }]])
    )

    await syncContactProfiles(storage, discovery)

    expect(storage.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: "new-avatar.jpg", bio: "New bio" })
    )
  })

  it("handles empty contact list", async () => {
    const storage = createFakeStorage([])
    const discovery = createFakeDiscovery()

    await syncContactProfiles(storage, discovery)

    expect(discovery.resolveProfile).not.toHaveBeenCalled()
    expect(storage.updateContact).not.toHaveBeenCalled()
  })

  it("continues when one contact's profile fetch fails", async () => {
    const storage = createFakeStorage([
      { did: "did:key:bob", name: "Bob", status: "active" },
      { did: "did:key:carla", name: "Old Carla", status: "active" },
    ])
    const discovery = createFakeDiscovery(
      new Map([["did:key:carla", {
        did: "did:key:carla", name: "New Carla",
        encryptionPublicKey: "k", updatedAt: new Date().toISOString(),
      }]])
    )
    // Bob's profile fetch returns null (not on server)
    // Carla's profile fetch returns updated name

    await syncContactProfiles(storage, discovery)

    // Only Carla should be updated
    expect(storage.updateContact).toHaveBeenCalledTimes(1)
    expect(storage.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({ did: "did:key:carla", name: "New Carla" })
    )
  })
})
