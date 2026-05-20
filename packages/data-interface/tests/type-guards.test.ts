import { describe, it, expect } from "vitest"
import {
  isWritable,
  hasRelations,
  hasGroups,
  isAuthenticatable,
  hasMultiSource,
  hasContacts,
  hasMessaging,
  hasProfile,
  hasEventListener,
  hasConfirmations,
  hasConfirmationWriter,
  hasEncounterVerification,
  BaseConnector,
  createObservable,
} from "../src/index.js"
import type { ConfirmationView, DataInterface, Item, ItemFilter, Observable } from "../src/index.js"

// Minimal DataInterface stub
function createStub(extra: Record<string, unknown> = {}): DataInterface {
  return {
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => ({ current: [], subscribe: () => () => {} }),
    observeItem: () => ({ current: null, subscribe: () => () => {} }),
    ...extra,
  }
}

describe("Type Guards", () => {
  describe("isWritable", () => {
    it("returns false for plain DataInterface", () => {
      expect(isWritable(createStub())).toBe(false)
    })

    it("returns false when only some write methods present", () => {
      expect(isWritable(createStub({ createItem: () => {} }))).toBe(false)
    })

    it("returns true when all write methods present", () => {
      const connector = createStub({
        createItem: async () => ({}),
        updateItem: async () => ({}),
        deleteItem: async () => {},
      })
      expect(isWritable(connector)).toBe(true)
    })
  })

  describe("hasRelations", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasRelations(createStub())).toBe(false)
    })

    it("returns true when getRelatedItems and observeRelatedItems are present", () => {
      expect(hasRelations(createStub({
        getRelatedItems: async () => [],
        observeRelatedItems: () => ({ current: [], subscribe: () => () => {} }),
      }))).toBe(true)
    })
  })

  describe("hasGroups", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasGroups(createStub())).toBe(false)
    })

    it("returns false when only some group methods present", () => {
      expect(hasGroups(createStub({ getGroups: async () => [] }))).toBe(false)
    })

    it("returns true when all required group methods present", () => {
      const connector = createStub({
        getGroups: async () => [],
        observeGroups: () => ({ current: [], subscribe: () => () => {} }),
        getMembers: async () => [],
      })
      expect(hasGroups(connector)).toBe(true)
    })
  })

  describe("isAuthenticatable", () => {
    it("returns false for plain DataInterface", () => {
      expect(isAuthenticatable(createStub())).toBe(false)
    })

    it("returns true when auth methods present", () => {
      const connector = createStub({
        getAuthState: () => ({ current: { status: "unauthenticated" }, subscribe: () => () => {} }),
        authenticate: async () => ({}),
      })
      expect(isAuthenticatable(connector)).toBe(true)
    })
  })

  describe("hasMultiSource", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasMultiSource(createStub())).toBe(false)
    })

    it("returns true when source methods present", () => {
      const connector = createStub({
        getSources: () => [],
        getActiveSource: () => ({}),
      })
      expect(hasMultiSource(connector)).toBe(true)
    })
  })

  describe("hasContacts", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasContacts(createStub())).toBe(false)
    })

    it("returns true when contact methods present", () => {
      const connector = createStub({
        getContacts: async () => [],
        observeContacts: () => ({ current: [], subscribe: () => () => {} }),
        addContact: async () => ({}),
      })
      expect(hasContacts(connector)).toBe(true)
    })
  })

  describe("hasMessaging", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasMessaging(createStub())).toBe(false)
    })

    it("returns true when messaging methods present", () => {
      const connector = createStub({
        getRelayState: () => ({ current: "disconnected", subscribe: () => () => {} }),
        getOutboxPendingCount: () => ({ current: 0, subscribe: () => () => {} }),
      })
      expect(hasMessaging(connector)).toBe(true)
    })
  })

  describe("hasProfile", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasProfile(createStub())).toBe(false)
    })

    it("returns true when profile methods present", () => {
      const connector = createStub({
        getMyProfile: async () => null,
        observeMyProfile: () => ({ current: null, subscribe: () => () => {} }),
        syncProfile: async () => {},
      })
      expect(hasProfile(connector)).toBe(true)
    })
  })

  describe("hasEventListener", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasEventListener(createStub())).toBe(false)
    })

    it("returns true when onIncomingEvent is present", () => {
      const connector = createStub({
        onIncomingEvent: () => () => {},
      })
      expect(hasEventListener(connector)).toBe(true)
    })
  })

  describe("hasConfirmations", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasConfirmations(createStub())).toBe(false)
    })

    it("returns false when only some confirmation methods are present", () => {
      expect(
        hasConfirmations(
          createStub({
            getConfirmations: async () => [] as ConfirmationView[],
          })
        )
      ).toBe(false)
    })

    it("returns true when confirmation read/observe methods are present", () => {
      const connector = createStub({
        getConfirmations: async () => [] as ConfirmationView[],
        observeConfirmations: () => ({
          current: [] as ConfirmationView[],
          subscribe: () => () => {},
        }),
      })
      expect(hasConfirmations(connector)).toBe(true)
    })

    it("is independent from writing and encounter verification capabilities", () => {
      const confirmationConnector = createStub({
        getConfirmations: async () => [] as ConfirmationView[],
        observeConfirmations: () => ({
          current: [] as ConfirmationView[],
          subscribe: () => () => {},
        }),
      })
      expect(hasConfirmations(confirmationConnector)).toBe(true)
      expect(hasConfirmationWriter(confirmationConnector)).toBe(false)
      expect(hasEncounterVerification(confirmationConnector)).toBe(false)
    })

    it("returns false for a plain BaseConnector subclass that inherits both defaults", () => {
      class PlainConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
      }
      expect(hasConfirmations(new PlainConnector())).toBe(false)
    })

    it("returns false when only getConfirmations is overridden (observe still inherited)", () => {
      class GetOnlyConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
        override async getConfirmations(): Promise<ConfirmationView[]> {
          return []
        }
      }
      expect(hasConfirmations(new GetOnlyConnector())).toBe(false)
    })

    it("returns false when only observeConfirmations is overridden (get still inherited)", () => {
      class ObserveOnlyConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
        override observeConfirmations(): Observable<ConfirmationView[]> {
          return createObservable<ConfirmationView[]>([])
        }
      }
      expect(hasConfirmations(new ObserveOnlyConnector())).toBe(false)
    })

    it("returns true when a BaseConnector subclass overrides both methods", () => {
      class FullConfirmationConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
        override async getConfirmations(): Promise<ConfirmationView[]> {
          return []
        }
        override observeConfirmations(): Observable<ConfirmationView[]> {
          return createObservable<ConfirmationView[]>([])
        }
      }
      expect(hasConfirmations(new FullConfirmationConnector())).toBe(true)
    })
  })

  describe("hasConfirmationWriter", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasConfirmationWriter(createStub())).toBe(false)
    })

    it("returns false when only one write method is present", () => {
      expect(hasConfirmationWriter(createStub({
        issueConfirmation: async () => ({}),
      }))).toBe(false)
    })

    it("returns true when confirmation write methods are present", () => {
      const connector = createStub({
        issueConfirmation: async () => ({
          id: "c-1",
          subjectId: "did:example:bob",
          issuerId: "did:example:alice",
          claim: "helped build a garden bed",
          createdAt: "2026-05-18T00:00:00.000Z",
          trustLevel: "signed-attested",
        } satisfies ConfirmationView),
        setConfirmationAccepted: async () => {},
      })
      expect(hasConfirmationWriter(connector)).toBe(true)
      expect(hasConfirmations(connector)).toBe(false)
    })

    it("returns false for a BaseConnector subclass that inherits writer defaults", () => {
      class PlainConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
      }
      expect(hasConfirmationWriter(new PlainConnector())).toBe(false)
    })
  })

  describe("hasEncounterVerification", () => {
    it("returns false for plain DataInterface", () => {
      expect(hasEncounterVerification(createStub())).toBe(false)
    })

    it("returns false when only challenge creation is present", () => {
      expect(hasEncounterVerification(createStub({
        createVerificationChallenge: async () => ({ code: "code", nonce: "nonce" }),
      }))).toBe(false)
    })

    it("returns true when encounter-verification methods are present", () => {
      const connector = createStub({
        createVerificationChallenge: async () => ({ code: "code", nonce: "nonce" }),
        prepareVerificationResponse: async () => ({ peerId: "did:example:peer" }),
        confirmVerificationResponse: async () => {},
        counterVerify: async () => {},
        getVerificationStatus: () => "mutual",
      })
      expect(hasEncounterVerification(connector)).toBe(true)
      expect(hasConfirmations(connector)).toBe(false)
      expect(hasConfirmationWriter(connector)).toBe(false)
    })

    it("returns false for a BaseConnector subclass that inherits encounter defaults", () => {
      class PlainConnector extends BaseConnector {
        async getItems(_filter?: ItemFilter): Promise<Item[]> {
          return []
        }
        async getItem(_id: string): Promise<Item | null> {
          return null
        }
        async createItem(_item: Omit<Item, "id" | "createdAt">): Promise<Item> {
          throw new Error("not supported")
        }
        async updateItem(_id: string, _updates: Partial<Item>): Promise<Item> {
          throw new Error("not supported")
        }
        async deleteItem(_id: string): Promise<void> {}
      }
      expect(hasEncounterVerification(new PlainConnector())).toBe(false)
    })
  })

  describe("ConfirmationView shape", () => {
    it("accepts the spec fields and tolerates optional ones", () => {
      const minimal: ConfirmationView = {
        id: "c-1",
        subjectId: "subject-did",
        claim: "physical-meeting",
        createdAt: "2026-05-18T00:00:00.000Z",
        trustLevel: "signed-attested",
      }
      expect(minimal.trustLevel).toBe("signed-attested")

      const full: ConfirmationView = {
        id: "c-2",
        subjectId: "subject-did",
        issuerId: "issuer-did",
        claim: "skill:cooking",
        schema: "rln://schemas/attestation@1",
        tags: ["skill"],
        relations: [{ predicate: "evidence", target: "item:proof-1" }],
        createdAt: "2026-05-18T00:00:00.000Z",
        trustLevel: "server-confirmed",
        source: "wot",
        isAccepted: true,
      }
      expect(full.trustLevel).toBe("server-confirmed")
      expect(full.source).toBe("wot")
    })
  })
})
