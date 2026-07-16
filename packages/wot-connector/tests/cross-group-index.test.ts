import { describe, it, expect, vi, beforeEach } from "vitest"
import { CrossGroupIndex, crossGroupItemKey } from "../src/CrossGroupIndex.js"
import type { CrossGroupEntry } from "../src/CrossGroupIndex.js"

// --- Mock types ---

interface TestDoc {
  items: Record<string, TestItem>
}

interface TestItem {
  id: string
  type: string
  title: string
}

// --- Mock SpaceHandle ---

function createMockHandle(groupId: string, doc: TestDoc) {
  const remoteCallbacks = new Set<() => void>()
  return {
    id: groupId,
    doc,
    info: () => ({
      id: groupId,
      type: "shared" as const,
      members: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    getDoc: () => doc,
    getMeta: () => ({}),
    transact: (fn: (doc: TestDoc) => void) => fn(doc),
    onRemoteUpdate: (cb: () => void) => {
      remoteCallbacks.add(cb)
      return () => remoteCallbacks.delete(cb)
    },
    close: vi.fn(),
    // Test helpers
    simulateRemoteUpdate: () => {
      for (const cb of remoteCallbacks) cb()
    },
    remoteCallbacks,
  }
}

// --- Mock ReplicationAdapter ---

function createMockReplication() {
  let spaces: Array<{ id: string; type: "shared" | "personal" }> = []
  let spacesCallback: ((spaces: typeof spaces) => void) | null = null
  const handles = new Map<string, ReturnType<typeof createMockHandle>>()

  return {
    handles,
    setSpaces(newSpaces: typeof spaces) {
      spaces = newSpaces
      spacesCallback?.(spaces)
    },
    registerHandle(groupId: string, handle: ReturnType<typeof createMockHandle>) {
      handles.set(groupId, handle)
    },
    // ReplicationAdapter interface (partial)
    watchSpaces: () => ({
      getValue: () => spaces,
      subscribe: (cb: (value: typeof spaces) => void) => {
        spacesCallback = cb
        return () => { spacesCallback = null }
      },
    }),
    openSpace: vi.fn(async (groupId: string) => {
      const handle = handles.get(groupId)
      if (!handle) throw new Error(`No handle for ${groupId}`)
      return handle
    }),
  }
}

// --- Helpers ---

function extractItems(doc: TestDoc): Map<string, TestItem> {
  const map = new Map<string, TestItem>()
  for (const [id, item] of Object.entries(doc.items)) {
    map.set(id, item)
  }
  return map
}

function getItemType(item: TestItem): string {
  return item.type
}

// --- Tests ---

describe("CrossGroupIndex", () => {
  let replication: ReturnType<typeof createMockReplication>

  beforeEach(() => {
    replication = createMockReplication()
  })

  function createIndex(options?: { groupFilter?: (info: { type: string }) => boolean }) {
    return new CrossGroupIndex<TestDoc, TestItem>(
      replication as any,
      extractItems,
      getItemType,
      options,
    )
  }

  describe("start/stop", () => {
    it("subscribes to watchSpaces on start", () => {
      const handle = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      // Should have opened the space and indexed items
      expect(replication.openSpace).toHaveBeenCalledWith("group-1")

      index.stop()
    })

    it("cleans up on stop", async () => {
      const handle = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      // Wait for async addGroup
      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      index.stop()

      expect(handle.close).toHaveBeenCalled()
      expect(index.getAll().size).toBe(0)
    })

    it("is idempotent", () => {
      const index = createIndex()
      index.start()
      index.start() // should not throw
      index.stop()
      index.stop() // should not throw
    })
  })

  describe("indexing", () => {
    it("indexes items from a single group", async () => {
      const handle = createMockHandle("group-1", {
        items: {
          "t1": { id: "t1", type: "task", title: "Task 1" },
          "t2": { id: "t2", type: "event", title: "Event 1" },
        },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      const all = index.getAll()
      expect(all.get("t1")?.item.title).toBe("Task 1")
      expect(all.get("t1")?.groupId).toBe("group-1")
      expect(all.get("t2")?.item.type).toBe("event")

      index.stop()
    })

    it("indexes items from multiple groups", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      expect(index.getItemGroupId("t1")).toBe("group-1")
      expect(index.getItemGroupId("t2")).toBe("group-2")

      index.stop()
    })

    it("keeps identical item IDs from different groups independent", async () => {
      const doc1: TestDoc = {
        items: { shared: { id: "shared", type: "task", title: "Group 1" } },
      }
      const doc2: TestDoc = {
        items: { shared: { id: "shared", type: "task", title: "Group 2" } },
      }
      const handle1 = createMockHandle("group-1", doc1)
      const handle2 = createMockHandle("group-2", doc2)
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAllScoped().size).toBe(2))
      expect(index.getAll()).toEqual(new Map())
      expect(index.getAllScoped().get(crossGroupItemKey("group-1", "shared"))?.item.title).toBe("Group 1")
      expect(index.getAllScoped().get(crossGroupItemKey("group-2", "shared"))?.item.title).toBe("Group 2")
      expect(index.getByType("task")).toHaveLength(2)
      expect(index.getUniqueById("shared")).toBeNull()
      expect(index.getItemGroupId("shared")).toBeNull()

      delete doc1.items.shared
      handle1.simulateRemoteUpdate()

      expect(index.getAllScoped().size).toBe(1)
      expect(index.getAll().get("shared")?.item.title).toBe("Group 2")
      expect(index.getUniqueById("shared")?.item.title).toBe("Group 2")
      expect(index.getItemGroupId("shared")).toBe("group-2")

      index.stop()
    })

    it("reindexes on remote update", async () => {
      const doc: TestDoc = {
        items: { "t1": { id: "t1", type: "task", title: "Original" } },
      }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      // Simulate remote change
      doc.items["t1"].title = "Updated"
      doc.items["t3"] = { id: "t3", type: "note", title: "New" }
      handle.simulateRemoteUpdate()

      expect(index.getAll().size).toBe(2)
      expect(index.getAll().get("t1")?.item.title).toBe("Updated")
      expect(index.getAll().get("t3")?.item.title).toBe("New")

      index.stop()
    })

    it("removes deleted items on reindex", async () => {
      const doc: TestDoc = {
        items: {
          "t1": { id: "t1", type: "task", title: "Task 1" },
          "t2": { id: "t2", type: "task", title: "Task 2" },
        },
      }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      // Delete t2
      delete doc.items["t2"]
      handle.simulateRemoteUpdate()

      expect(index.getAll().size).toBe(1)
      expect(index.getAll().has("t2")).toBe(false)
      expect(index.getByType("task")).toHaveLength(1)

      index.stop()
    })
  })

  describe("group lifecycle", () => {
    it("adds items when a new group appears", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)

      // Start with one group
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      // Add second group
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      expect(index.getItemGroupId("t2")).toBe("group-2")

      index.stop()
    })

    it("removes items when a group disappears", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)

      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      // Remove group-2
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      expect(index.getAll().size).toBe(1)
      expect(index.getAll().has("t2")).toBe(false)
      expect(handle2.close).toHaveBeenCalled()

      index.stop()
    })
  })

  describe("queries", () => {
    it("getByType returns items of given type", async () => {
      const handle = createMockHandle("group-1", {
        items: {
          "t1": { id: "t1", type: "task", title: "Task 1" },
          "t2": { id: "t2", type: "event", title: "Event 1" },
          "t3": { id: "t3", type: "task", title: "Task 2" },
        },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(3))

      expect(index.getByType("task")).toHaveLength(2)
      expect(index.getByType("event")).toHaveLength(1)
      expect(index.getByType("nonexistent")).toHaveLength(0)

      index.stop()
    })

    it("getByGroup returns items for given group", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      expect(index.getByGroup("group-1").size).toBe(1)
      expect(index.getByGroup("group-1").get("t1")?.title).toBe("Task 1")
      expect(index.getByGroup("unknown").size).toBe(0)

      index.stop()
    })

    it("getItemGroupId returns correct group", async () => {
      const handle = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      expect(index.getItemGroupId("t1")).toBe("group-1")
      expect(index.getItemGroupId("nonexistent")).toBeNull()

      index.stop()
    })
  })

  describe("getFiltered", () => {
    it("returns all items when no filter", async () => {
      const handle = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      expect(index.getFiltered({}).size).toBe(1)
      expect(index.getFiltered({ includedGroups: null }).size).toBe(1)

      index.stop()
    })

    it("filters by includedGroups", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      const filtered = index.getFiltered({ includedGroups: ["group-1"] })
      expect(filtered.size).toBe(1)
      expect(filtered.has("t1")).toBe(true)

      index.stop()
    })

    it("filters by excludedGroups", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("group-2", {
        items: { "t2": { id: "t2", type: "task", title: "Task 2" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("group-2", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "group-2", type: "shared" },
      ])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(2))

      const filtered = index.getFiltered({ excludedGroups: ["group-2"] })
      expect(filtered.size).toBe(1)
      expect(filtered.has("t1")).toBe(true)

      index.stop()
    })
  })

  describe("groupFilter option", () => {
    it("only indexes groups matching filter", async () => {
      const handle1 = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      const handle2 = createMockHandle("personal", {
        items: { "p1": { id: "p1", type: "note", title: "Note 1" } },
      })
      replication.registerHandle("group-1", handle1)
      replication.registerHandle("personal", handle2)
      replication.setSpaces([
        { id: "group-1", type: "shared" },
        { id: "personal", type: "personal" },
      ])

      const index = createIndex({
        groupFilter: (info) => info.type === "shared",
      })
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      expect(index.getAll().has("t1")).toBe(true)
      expect(index.getAll().has("p1")).toBe(false)

      index.stop()
    })
  })

  describe("onChange", () => {
    it("notifies on new items", async () => {
      const doc: TestDoc = { items: {} }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      const onChange = vi.fn()
      index.onChange(onChange)
      index.start()

      // Wait for initial index (empty doc triggers onChange too)
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
      onChange.mockClear()

      // Add item remotely
      doc.items["t1"] = { id: "t1", type: "task", title: "New" }
      handle.simulateRemoteUpdate()

      // onChange is debounced via microtask
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))

      index.stop()
    })

    it("unsubscribe works", async () => {
      const doc: TestDoc = { items: {} }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      const onChange = vi.fn()
      const unsub = index.onChange(onChange)
      index.start()

      await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
      onChange.mockClear()

      unsub()

      doc.items["t1"] = { id: "t1", type: "task", title: "New" }
      handle.simulateRemoteUpdate()

      // Wait for microtask to flush
      await new Promise(r => queueMicrotask(r))
      expect(onChange).not.toHaveBeenCalled()

      index.stop()
    })
  })

  describe("reindexGroup", () => {
    it("manually reindexes after local write", async () => {
      const doc: TestDoc = {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      // Local write (no remote update fired)
      doc.items["t2"] = { id: "t2", type: "task", title: "Local" }
      index.reindexGroup("group-1")

      expect(index.getAll().size).toBe(2)
      expect(index.getAll().get("t2")?.item.title).toBe("Local")

      index.stop()
    })

    it("no-op for unknown group", () => {
      const index = createIndex()
      index.start()
      expect(() => index.reindexGroup("unknown")).not.toThrow()
      index.stop()
    })
  })

  describe("type index consistency", () => {
    it("handles type changes on reindex", async () => {
      const doc: TestDoc = {
        items: { "t1": { id: "t1", type: "task", title: "Task" } },
      }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      index.start()

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      expect(index.getByType("task")).toHaveLength(1)
      expect(index.getByType("event")).toHaveLength(0)

      // Change type
      doc.items["t1"] = { id: "t1", type: "event", title: "Now Event" }
      handle.simulateRemoteUpdate()

      expect(index.getByType("task")).toHaveLength(0)
      expect(index.getByType("event")).toHaveLength(1)

      index.stop()
    })
  })

  describe("debouncing", () => {
    it("coalesces multiple synchronous updates into one notification", async () => {
      const doc: TestDoc = {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      }
      const handle = createMockHandle("group-1", doc)
      replication.registerHandle("group-1", handle)
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      const index = createIndex()
      const onChange = vi.fn()
      index.onChange(onChange)
      index.start()

      await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
      onChange.mockClear()

      // Fire 3 remote updates synchronously
      doc.items["t2"] = { id: "t2", type: "task", title: "Task 2" }
      handle.simulateRemoteUpdate()
      doc.items["t3"] = { id: "t3", type: "task", title: "Task 3" }
      handle.simulateRemoteUpdate()
      doc.items["t4"] = { id: "t4", type: "task", title: "Task 4" }
      handle.simulateRemoteUpdate()

      // Should coalesce into 1 notification
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))

      // But all items should be indexed
      expect(index.getAll().size).toBe(4)

      index.stop()
    })
  })

  describe("race condition: duplicate addGroup", () => {
    it("does not add the same group twice on rapid watchSpaces updates", async () => {
      const handle = createMockHandle("group-1", {
        items: { "t1": { id: "t1", type: "task", title: "Task 1" } },
      })
      replication.registerHandle("group-1", handle)

      const index = createIndex()
      index.start()

      // Two rapid watchSpaces emissions with the same new group
      replication.setSpaces([{ id: "group-1", type: "shared" }])
      replication.setSpaces([{ id: "group-1", type: "shared" }])

      await vi.waitFor(() => expect(index.getAll().size).toBe(1))

      // openSpace should have been called only once
      expect(replication.openSpace).toHaveBeenCalledTimes(1)

      index.stop()
    })
  })
})
