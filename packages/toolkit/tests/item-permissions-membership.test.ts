import { describe, expect, it } from "vitest"
import type { DataInterface, Item } from "@real-life-stack/data-interface"
import { resolveItemPermissions } from "../src/hooks/use-item-permissions"

const ME = "user-me"
const OTHER = "user-other"

const item = (type: string, createdBy: string): Item =>
  ({ id: "i1", type, createdAt: "2026-08-06T10:00:00.000Z", createdBy, data: {} }) as Item

/** A writable connector WITHOUT its own authorization model (the common case). */
const writable = { createItem: () => {}, updateItem: () => {}, deleteItem: () => {} } as unknown as DataInterface

describe("resolveItemPermissions — Mitglieder duerfen Inhalte bearbeiten (rls#262)", () => {
  it("erlaubt Bearbeiten und Loeschen an FREMDEN Inhalts-Items", () => {
    // Bisher galt creator-owns. Das war weder das technische Modell (jedes
    // Mitglied haelt den Space-Schluessel bzw. die Supabase-Policy erlaubt es
    // laengst) noch praktisch.
    for (const type of ["post", "event", "task", "place", "statement"]) {
      expect(resolveItemPermissions(writable, item(type, OTHER), ME)).toEqual({
        canEdit: true,
        canDelete: true,
      })
    }
  })

  it("laesst Kommentare, Reaktionen und Relations beim Urheber", () => {
    // Diese drei tragen sichtbar eine fremde Aussage: einen fremden Kommentar
    // zu aendern hiesse, jemandem Worte in den Mund zu legen; eine Reaktion
    // oder Stimme zu aendern hiesse, fuer jemanden abzustimmen.
    for (const type of ["comment", "reaction", "relation"]) {
      expect(resolveItemPermissions(writable, item(type, OTHER), ME)).toEqual({
        canEdit: false,
        canDelete: false,
      })
    }
  })

  it("laesst den Urheber seine eigenen Kommentare und Reaktionen bearbeiten", () => {
    for (const type of ["comment", "reaction", "relation"]) {
      expect(resolveItemPermissions(writable, item(type, ME), ME)).toEqual({
        canEdit: true,
        canDelete: true,
      })
    }
  })

  it("gibt ohne angemeldeten Nutzer nichts frei", () => {
    expect(resolveItemPermissions(writable, item("post", OTHER), undefined)).toEqual({
      canEdit: false,
      canDelete: false,
    })
  })
})
