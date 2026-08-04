// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { createObservable, type Item, type User } from "@real-life-stack/data-interface"

import { ConnectorProvider } from "../src/hooks/connector-context"
import { ItemTypeBadge } from "../src/components/preview/item-type-badge"
import { getItemPreviewAdornments } from "../src/components/preview/item-type-meta"
import {
  registerTypePresentation,
  renderTypeFooter,
  resetTypePresentationForTests,
  resolveTypePresentation,
} from "../src/components/preview/type-presentation"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item = (type: string, data: Record<string, unknown> = {}, relations: Item["relations"] = []): Item =>
  ({ id: `i-${type}`, type, createdAt: "2026-08-04T10:00:00.000Z", createdBy: "u1", data, relations }) as Item

afterEach(() => resetTypePresentationForTests())

describe("type presentation registry", () => {
  it("resolves core entries with the previous badge labels and styles", () => {
    const task = resolveTypePresentation("task")
    expect(task.label).toBe("Task")
    expect(task.badge?.className).toContain("amber")
    expect(task.generic).toBe(false)
  })

  it("falls back generically for unknown types — visible, never broken (rule 5)", () => {
    const resolved = resolveTypePresentation("recipe")
    expect(resolved.generic).toBe(true)
    expect(resolved.label).toBe("recipe")
    // The detail slot always exists, so every surface can render the item.
    expect(resolved.detail).toBeTruthy()
    // And the badge shows the raw type via the fallback path.
    const markup = renderToStaticMarkup(createElement(ItemTypeBadge, { type: "recipe", fallback: true }))
    expect(markup).toContain("recipe")
  })

  it("rejects a second entry for an already-presented id — no override in v0.1", () => {
    expect(() => registerTypePresentation("app", [{ id: "task", label: "Aufgabe" }]))
      .toThrow(/bereits vergeben/)
  })

  it("rejects re-registering a layer name", () => {
    registerTypePresentation("app", [{ id: "statement", label: "Aussage" }])
    expect(() => registerTypePresentation("app", [])).toThrow(/bereits registriert/)
  })

  it("lets an app layer add a type that then resolves everywhere", () => {
    registerTypePresentation("app", [{ id: "statement", label: "Aussage" }])
    expect(resolveTypePresentation("statement").label).toBe("Aussage")
    expect(resolveTypePresentation("statement").generic).toBe(false)
  })

  it("routes getItemPreviewAdornments through the registry (person keeps its profile meta)", () => {
    const adornments = getItemPreviewAdornments(item("person", { displayName: "Ada Lovelace" }))
    const markup = renderToStaticMarkup(createElement("div", null, adornments.metaAdornment))
    expect(markup).toContain("Ada Lovelace")
  })

  it("renders the task footer with resolved assignees on any surface", async () => {
    // Minimal fake: exactly the two observables the footer's hooks consume.
    const users: User[] = [{ id: "u1", displayName: "Ich" }, { id: "u2", displayName: "Kollegin" }]
    // The hooks route through useGroupConnector(), whose hasGroups() guard
    // wants the full group-manager surface — stubbed inertly.
    const connector = {
      observeMembers: () => createObservable(users),
      observeCurrentUser: () => createObservable<User | null>(users[0]),
      getAuthState: () => createObservable({ status: "authenticated", user: users[0] }),
      authenticate: async () => {},
      getCurrentUser: async () => users[0],
      getGroups: async () => [], observeGroups: () => createObservable([]),
      getMembers: async () => users, getCurrentGroup: () => null,
      observeCurrentGroup: () => createObservable(null), setCurrentGroup: () => {},
      createGroup: async () => { throw new Error("unused") },
      updateGroup: async () => { throw new Error("unused") },
      deleteGroup: async () => {}, inviteMember: async () => {}, removeMember: async () => {},
    }

    const task = item("task", { title: "T", status: "open" }, [
      { predicate: "assignedTo", target: "global:u2" },
    ])
    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(ConnectorProvider, {
          connector: connector as never,
          children: renderTypeFooter(task),
        }),
      )
    })
    expect(container.textContent).toContain("Kollegin")
    await act(async () => root.unmount())
  })

  it("returns no footer for types without one", () => {
    expect(renderTypeFooter(item("post"))).toBeNull()
  })
})
