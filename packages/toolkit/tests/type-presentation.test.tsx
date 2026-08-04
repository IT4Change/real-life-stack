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
  setTypeManifest,
} from "../src/components/preview/type-presentation"
import {
  composeTypeManifest,
  CORE_TYPE_LAYER,
  STATEMENT_TYPE_DEFINITION,
} from "@real-life-stack/data-interface"

/** Manifest wie in der App komponiert: Core + statement. */
const APP_MANIFEST = composeTypeManifest([
  CORE_TYPE_LAYER,
  { name: "app", definitions: [STATEMENT_TYPE_DEFINITION] },
])

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
      .toThrow(/bereits in Layer "core"/)
  })

  it("lets the same layer re-register itself (Vite HMR re-executes modules)", () => {
    setTypeManifest(APP_MANIFEST)
    registerTypePresentation("app", [{ id: "statement", label: "Aussage" }])
    registerTypePresentation("app", [{ id: "statement", label: "These" }])
    expect(resolveTypePresentation("statement").label).toBe("These")
  })

  it("still rejects an id owned by ANOTHER layer", () => {
    setTypeManifest(APP_MANIFEST)
    registerTypePresentation("app", [{ id: "statement", label: "Aussage" }])
    expect(() => registerTypePresentation("space", [{ id: "statement", label: "X" }]))
      .toThrow(/bereits in Layer "app"/)
  })

  it("extends a core type additively — a space fills an empty footer slot", () => {
    // #220-Review Blocker 4: without presentation fragments, the Core→App→
    // Space contract was only half implemented.
    const Footer = () => createElement("span", null, "Space-Fußzeile")
    registerTypePresentation("space", { extensions: [{ id: "place", footer: Footer }] })
    expect(resolveTypePresentation("place").footer).toBe(Footer)
    // The base entry stays intact.
    expect(resolveTypePresentation("place").label).toBe("Ort")
  })

  it("rejects a fragment setting a scalar the base already sets", () => {
    const Footer = () => null
    // task already ships a footer (assignees) — a fragment may not shadow it.
    expect(() => registerTypePresentation("space", { extensions: [{ id: "task", footer: Footer }] }))
      .toThrow(/Basis bereits setzt/)
    // The failed registration leaves no partial layer behind.
    expect(resolveTypePresentation("task").footer).not.toBe(Footer)
  })

  it("shows the type badge in lenses for registered types WITHOUT a preview slot", () => {
    // #220-Review Blocker 1: task/place/statement lost their badge in
    // list/grid because getItemPreviewAdornments returned {} for them.
    const adornments = getItemPreviewAdornments(item("task", { title: "T", status: "open" }))
    const markup = renderToStaticMarkup(createElement("div", null, adornments.headerAdornment))
    expect(markup).toContain("Task")
  })

  it("shows a neutral badge for unknown types even WITHOUT the fallback prop (rule 5)", () => {
    // #220-Review Blocker 2: detail/feed call ItemTypeBadge without
    // `fallback`; an unknown connector type rendered nothing there.
    const markup = renderToStaticMarkup(createElement(ItemTypeBadge, { type: "recipe" }))
    expect(markup).toContain("recipe")
    // A REGISTERED type without badge style (post) still renders nothing —
    // that is a deliberate design decision, not a gap.
    const post = renderToStaticMarkup(createElement("div", null, createElement(ItemTypeBadge, { type: "post" })))
    expect(post).toBe("<div></div>")
  })

  it("lets an app layer present a MANIFEST-known type that then resolves everywhere", () => {
    setTypeManifest(APP_MANIFEST)
    registerTypePresentation("app", [{ id: "statement", label: "Aussage" }])
    expect(resolveTypePresentation("statement").label).toBe("Aussage")
    expect(resolveTypePresentation("statement").generic).toBe(false)
  })

  it("rejects orphan presentation — the register cannot introduce types (rules 1/6)", () => {
    // #220-Review Blocker 3: without manifest binding any id slipped through
    // and resolved with generic:false despite having no identity anywhere.
    expect(() => registerTypePresentation("app", [{ id: "recipe", label: "Rezept" }]))
      .toThrow(/führt keine Typen ein/)
  })

  it("resolves a manifest entry WITHOUT presentation as generic (rule 5)", () => {
    setTypeManifest(APP_MANIFEST)
    // statement is in the manifest, but no presentation layer registered it.
    const resolved = resolveTypePresentation("statement")
    expect(resolved.generic).toBe(true)
    expect(resolved.detail).toBeTruthy()
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
