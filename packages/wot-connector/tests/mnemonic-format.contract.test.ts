// Vertragstests Magic-Words-Parität (TDD — VOR der Implementierung, Start: ROT).
// UX-Vertrag (Parität mit der WoT-Demo-App, dort seit deren PR #278):
//   V1: Kopieren liefert 12 NUMMERIERTE Zeilen ("1. wort" … "12. wort") — die
//       Reihenfolge bleibt beim Übertragen/Abschreiben prüfbar.
//   V2: Der Import-Parser akzeptiert ALLE gängigen Einfüge-Formate (nummerierte
//       Zeilen, Inline-Nummerierung mit/ohne Punkt, plain) — Roundtrip-sicher.
//       Cross-App-Interop: in der WoT-App kopierte Wörter MÜSSEN im
//       RLS-Import funktionieren (und umgekehrt).
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const WORDS = "apple banana cherry dog elephant fox grape horse igloo jungle kiwi lemon".split(" ")
const PLAIN = WORDS.join(" ")

async function loadModule() {
  const mod = await import("../src/mnemonic-format.js")
  return mod as {
    formatMnemonicForCopy(words: readonly string[]): string
    cleanMnemonicInput(text: string): string
  }
}

describe("Vertrag Magic-Words-Parität — Format & Parser", () => {
  it("V1: formatMnemonicForCopy liefert 12 nummerierte Zeilen", async () => {
    const { formatMnemonicForCopy } = await loadModule()
    const out = formatMnemonicForCopy(WORDS)
    const lines = out.split("\n")
    expect(lines).toHaveLength(12)
    expect(lines[0]).toBe("1. apple")
    expect(lines[11]).toBe("12. lemon")
  })

  it("V2: Roundtrip — das eigene Copy-Format parsed zurück auf plain", async () => {
    const { formatMnemonicForCopy, cleanMnemonicInput } = await loadModule()
    expect(cleanMnemonicInput(formatMnemonicForCopy(WORDS))).toBe(PLAIN)
  })

  it.each([
    ["nummerierte Zeilen", WORDS.map((w, i) => `${i + 1}. ${w}`).join("\n")],
    ["Inline mit Punkt (Notiz-App frisst Umbrüche)", WORDS.map((w, i) => `${i + 1}. ${w}`).join(" ")],
    ["Inline ohne Punkt", WORDS.map((w, i) => `${i + 1} ${w}`).join(" ")],
    ["plain", PLAIN],
    ["Großschreibung + Extra-Whitespace", `  ${PLAIN.toUpperCase().replace(/ /g, "   ")}  `],
  ])("V2: Einfüge-Format „%s\" wird zu plain normalisiert", async (_name, input) => {
    const { cleanMnemonicInput } = await loadModule()
    expect(cleanMnemonicInput(input)).toBe(PLAIN)
  })
})

describe("Vertrag Magic-Words-Parität — Wiring in den Flows", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const read = (p: string) => readFileSync(resolve(here, p), "utf8")

  it("OnboardingFlow kopiert über formatMnemonicForCopy (nicht plain join)", () => {
    const src = read("../src/components/OnboardingFlow.tsx")
    expect(src).toMatch(/formatMnemonicForCopy/)
    expect(src).not.toMatch(/clipboard\.writeText\(mnemonic\.join\(" "\)\)/)
  })

  it("RecoveryFlow normalisiert die Eingabe über cleanMnemonicInput VOR der Validierung", () => {
    const src = read("../src/components/RecoveryFlow.tsx")
    expect(src).toMatch(/cleanMnemonicInput/)
  })
})
