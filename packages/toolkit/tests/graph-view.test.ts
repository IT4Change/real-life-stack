import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { GraphView } from "../src/components/graph/graph-view"
import {
  isSafeImageUrl,
  resumePanAfterPinch,
  selectionAnnouncement,
  shouldSelectOnPointerFinish,
} from "../src/components/graph/graph-view-helpers"

describe("GraphView interactions", () => {
  it("does not select when the remaining pointer is released after a pinch", () => {
    const gesture = resumePanAfterPinch(7, { x: 120, y: 80 })

    expect(gesture).toMatchObject({
      mode: "pan",
      pointerId: 7,
      moved: true,
      startX: 120,
      startY: 80,
    })
    expect(shouldSelectOnPointerFinish(gesture, 7, true)).toBe(false)
  })

  it("only allows secure or embedded avatar image sources", () => {
    expect(isSafeImageUrl("data:image/webp;base64,UklGRg==")).toBe(true)
    expect(isSafeImageUrl("https://example.test/avatar.webp")).toBe(true)
    expect(isSafeImageUrl("http://example.test/avatar.webp")).toBe(false)
  })

  it("provides canvas keyboard instructions and a polite status region", () => {
    const markup = renderToStaticMarkup(createElement(GraphView, {
      nodes: [{ id: "person-ada", label: "Ada", type: "person" }],
      edges: [],
      selectedNodeId: null,
      onSelectedNodeChange: () => undefined,
    }))

    expect(markup).toContain('role="application"')
    const descriptionId = markup.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeTruthy()
    expect(markup).toContain(`id="${descriptionId}"`)
    expect(markup).toContain("Pfeiltasten wählen Knoten aus. Escape hebt die Auswahl auf.")
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-atomic="true"')
  })

  it("formats the keyboard selection announcement with the node label", () => {
    expect(selectionAnnouncement("Ada Lovelace")).toBe("Ada Lovelace ausgewählt.")
  })
})
