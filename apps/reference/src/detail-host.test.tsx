// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it } from "vitest"
import { MockConnector } from "@real-life-stack/mock-connector"
import { ConnectorProvider } from "@real-life-stack/toolkit"

import { ItemDetailRead } from "./detail-host"
import { feedFooter, mergeFeedItems, showFeedSkeleton } from "./views/feed-view"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The detail panel is ONE surface. What it shows follows the item, never the
 * module that opened it — so these render the same item under different module
 * context and compare.
 */

const ME = "user-me"
const MATE = "user-mate"
const SPACE_A = "space-a"
const SPACE_B = "space-b"

async function connectorWith(task: Record<string, unknown>) {
  const connector = new MockConnector({
    items: [],
    groups: [
      { id: SPACE_A, name: "Space A", data: {} },
      { id: SPACE_B, name: "Space B", data: {} },
    ],
    users: [
      { id: ME, displayName: "Ich" },
      { id: MATE, displayName: "Kollegin" },
    ],
    groupMembers: { [SPACE_A]: [MATE], [SPACE_B]: [MATE] },
    groupItems: {},
  } as never)
  await connector.init()
  return { connector, task }
}

/** Render the shared read view and return its text. */
async function readWith(
  connector: MockConnector,
  item: Record<string, unknown>,
  groupId: string | null,
) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(ConnectorProvider, {
        connector: connector as never,
        children: createElement(ItemDetailRead, {
          item: item as never,
          actions: null,
          groupId,
        }),
      }),
    )
  })
  await act(async () => { await Promise.resolve() })
  const text = container.textContent ?? ""
  const reactionButtons = container.querySelectorAll('[aria-label="Add reaction"]').length
  const voteButtons = container.querySelectorAll('[aria-label^="Zustimmung"]').length
  await act(async () => { root.unmount() })
  container.remove()
  return { text, reactionButtons, voteButtons }
}

/** Convenience for the many assertions that only look at text. */
const textOf = async (...args: Parameters<typeof readWith>) => (await readWith(...args)).text

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "task-1",
  type: "task",
  createdBy: MATE,
  createdAt: "2026-08-01T10:00:00.000Z",
  data: { title: "Beete vorbereiten", status: "open" },
  relations: [{ predicate: "assignedTo", target: `global:${MATE}` }],
  ...overrides,
})

const statement = (overrides: Record<string, unknown> = {}) => ({
  id: "statement-1",
  type: "statement",
  createdBy: MATE,
  createdAt: "2026-08-01T10:00:00.000Z",
  data: { title: "Wir brauchen einen zweiten Brunnen" },
  ...overrides,
})

describe("shared detail read view", () => {
  let connector: MockConnector

  beforeEach(async () => {
    ;({ connector } = await connectorWith({}))
  })

  it("renders the same body no matter which space context opened it", async () => {
    const item = task()
    const fromA = await textOf(connector, item, SPACE_A)
    const fromB = await textOf(connector, item, SPACE_B)
    expect(fromA).toBe(fromB)
    expect(fromA).toContain("Beete vorbereiten")
  })

  it("shows a task's assignees — a type rule, not a Kanban rule", async () => {
    const text = await textOf(connector, task(), SPACE_A)
    expect(text).toContain("Kollegin")
  })

  it("resolves an assignee who is the signed-in user but not a space member", async () => {
    // Regression (#204): assignees were looked up in `members` only. In a
    // personal space the signed-in user is not in that list, so a task
    // assigned to yourself showed nobody. SPACE_A deliberately lists only
    // MATE as a member — passing `null` would NOT reproduce it, because the
    // connector answers `observeMembers(null)` with every known user.
    const mine = task({
      createdBy: MATE,
      relations: [{ predicate: "assignedTo", target: `global:${ME}` }],
    })
    const text = await textOf(connector, mine, SPACE_A)
    expect(text).toContain("Ich")
  })

  it("adds assignees for tasks only — the type decides, not the surface", async () => {
    // Author and assignee are the same person here, so the name count is the
    // signal: twice for a task, once for anything else.
    const asTask = await textOf(connector, task(), SPACE_A)
    const asPost = await textOf(
      connector,
      task({ type: "post", relations: [], data: { title: "Notiz", content: "Text" } }),
      SPACE_A,
    )
    expect(asTask.match(/Kollegin/g)?.length).toBe(2)
    expect(asPost.match(/Kollegin/g)?.length).toBe(1)
  })

  it("offers reactions on a task too — reactions are not type-dependent", async () => {
    // Tasks were excluded from reactions until Anton corrected that. A task
    // now carries BOTH: its assignees and the reaction affordance.
    const asTask = await readWith(connector, task(), SPACE_A)
    const asPost = await readWith(
      connector,
      task({ type: "post", relations: [], data: { title: "Notiz", content: "Text" } }),
      SPACE_A,
    )
    expect(asTask.reactionButtons).toBe(1)
    expect(asPost.reactionButtons).toBe(1)
  })

  it("carries the item's type badge", async () => {
    expect(await textOf(connector, task(), SPACE_A)).toContain("Task")
  })

  it("offers the vote bar on a statement — voting follows the type, not the module", async () => {
    // A statement opened from ANY module's detail shows the vote controls;
    // other types never do (spec: docs/spec/modules/resonance.md).
    const asStatement = await readWith(connector, statement(), SPACE_A)
    const asPost = await readWith(
      connector,
      statement({ type: "post", data: { title: "Notiz", content: "Text" } }),
      SPACE_A,
    )
    expect(asStatement.voteButtons).toBe(1)
    expect(asPost.voteButtons).toBe(0)
    // Votes come IN ADDITION to reactions, not instead of them.
    expect(asStatement.reactionButtons).toBe(1)
  })

  it("labels a statement with its badge", async () => {
    expect(await textOf(connector, statement(), SPACE_A)).toContain("Aussage")
  })
})

describe("feed card footer", () => {
  it("offers reactions on a task too", async () => {
    // Same rule as in the detail panel: reactions do not depend on the type.
    // The feed card excluded tasks until that was corrected.
    const { connector } = await connectorWith({})
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(ConnectorProvider, {
          connector: connector as never,
          children: feedFooter(task() as never, () => {}),
        }),
      )
    })
    await act(async () => { await Promise.resolve() })
    expect(container.querySelectorAll('[aria-label="Add reaction"]').length).toBe(1)
    await act(async () => { root.unmount() })
    container.remove()
  })

  it("shows the vote bar on a statement card — a poll reads as a poll in the feed", async () => {
    const { connector } = await connectorWith({})
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(ConnectorProvider, {
          connector: connector as never,
          children: feedFooter(statement() as never, () => {}),
        }),
      )
    })
    await act(async () => { await Promise.resolve() })
    expect(container.querySelectorAll('[aria-label^="Zustimmung"]').length).toBe(1)
    // Reactions stay available alongside the votes.
    expect(container.querySelectorAll('[aria-label="Add reaction"]').length).toBe(1)
    await act(async () => { root.unmount() })
    container.remove()
  })
})

describe("feed item union", () => {
  const post = { id: "p1", type: "post", createdAt: "2026-08-01T10:00:00.000Z", createdBy: ME, data: { content: "Hallo" } }
  const comment = { id: "c1", type: "comment", createdAt: "2026-08-01T11:00:00.000Z", createdBy: ME, data: { content: "Antwort" } }

  it("includes statements — polls surface in the feed", () => {
    const merged = mergeFeedItems([post as never], [], [statement() as never])
    expect(merged.map((item) => item.id)).toEqual(["p1", "statement-1"])
  })

  it("still excludes comments and dedupes across the queries", () => {
    const merged = mergeFeedItems([post as never, comment as never], [post as never], [])
    expect(merged.map((item) => item.id)).toEqual(["p1"])
  })
})

describe("Feed-Skelett während des Erstsyncs (rls#265)", () => {
  it("zeigt vorhandene Beiträge, auch wenn eine der Abfragen noch leer ist", () => {
    // Beiträge sind da, Termine noch nicht: die Veroderung meldet „lädt",
    // aber es gibt etwas zu zeigen — Skelett wäre hier Verstecken.
    expect(showFeedSkeleton(true, 3)).toBe(false)
  })

  it("zeigt das Skelett, solange nichts da ist und noch etwas kommen kann", () => {
    expect(showFeedSkeleton(true, 0)).toBe(true)
  })

  it("zeigt kein Skelett, wenn nichts mehr kommt", () => {
    expect(showFeedSkeleton(false, 0)).toBe(false)
  })
})
