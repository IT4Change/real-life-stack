import { describe, it, expect } from "vitest"
import { User, Mail } from "lucide-react"
import { createInputWidget } from "./input-widget"
import { createMultiInputWidget } from "./multi-input-widget"

describe("createInputWidget", () => {
  it("returns a CustomWidgetDefinition carrying id, label, icon and a component", () => {
    const def = createInputWidget({ id: "givenName", label: "Vorname", icon: User })
    expect(def.id).toBe("givenName")
    expect(def.label).toBe("Vorname")
    expect(def.icon).toBe(User)
    expect(typeof def.component).toBe("function")
  })

  it("returns distinct component identities per call so React can key them", () => {
    const a = createInputWidget({ id: "givenName", label: "Vorname", icon: User })
    const b = createInputWidget({ id: "familyName", label: "Nachname", icon: User })
    expect(a.component).not.toBe(b.component)
    expect(a.id).not.toBe(b.id)
  })

  it("sets a displayName tied to the widget id (helps debugging)", () => {
    const def = createInputWidget({
      id: "organization",
      label: "Firma",
      icon: User,
      inputType: "text",
    })
    expect((def.component as { displayName?: string }).displayName).toBe(
      "InputWidget(organization)",
    )
  })
})

describe("createMultiInputWidget", () => {
  it("returns a CustomWidgetDefinition carrying id, label, icon and a component", () => {
    const def = createMultiInputWidget({ id: "email", label: "E-Mail", icon: Mail })
    expect(def.id).toBe("email")
    expect(def.label).toBe("E-Mail")
    expect(def.icon).toBe(Mail)
    expect(typeof def.component).toBe("function")
  })

  it("sets a displayName tied to the widget id (helps debugging)", () => {
    const def = createMultiInputWidget({
      id: "phone",
      label: "Telefon",
      icon: Mail,
    })
    expect((def.component as { displayName?: string }).displayName).toBe(
      "MultiInputWidget(phone)",
    )
  })
})
