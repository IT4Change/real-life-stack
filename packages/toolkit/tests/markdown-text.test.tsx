// @vitest-environment jsdom
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { describe, expect, it } from "vitest"

import { MarkdownText } from "../src/components/preview/markdown-text"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(markdown: string) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(MarkdownText, { children: markdown }))
  })
  const html = container.innerHTML
  const text = container.textContent ?? ""
  const injectedImages = container.querySelectorAll("img[onerror]").length
  const scripts = container.querySelectorAll("script").length
  await act(async () => root.unmount())
  container.remove()
  return { html, text, injectedImages, scripts }
}

describe("MarkdownText", () => {
  it("rendert Markdown statt ihn als Rohtext zu zeigen", async () => {
    const { html, text } = await render("Das ist **wichtig** und *kursiv*.")
    expect(html).toContain("<strong")
    expect(html).toContain("<em")
    // Die Sternchen selbst duerfen NICHT mehr sichtbar sein — genau das war
    // der Bug: der Composer schreibt Markdown, die Karte zeigte ihn roh.
    expect(text).not.toContain("**")
    expect(text).toContain("wichtig")
  })

  it("rendert Listen und Ueberschriften als Struktur", async () => {
    const { html } = await render("## Titel\n\n- eins\n- zwei")
    expect(html).toMatch(/<h4|<h5/)
    expect(html).toContain("<ul")
    expect(html.match(/<li/g)).toHaveLength(2)
  })

  it("rendert GFM-Tabellen (remark-gfm aktiv)", async () => {
    const { html } = await render("| a | b |\n| - | - |\n| 1 | 2 |")
    expect(html).toContain("<table")
  })

  it("rendert eingebettetes HTML NICHT als Markup", async () => {
    // Ohne rehype-raw bleibt HTML Text. Entscheidend ist nicht, ob der String
    // vorkommt (escaped darf er), sondern ob ein ELEMENT entsteht.
    const { text, injectedImages, scripts } = await render("<img src=x onerror=alert(1)> danach")
    expect(injectedImages).toBe(0)
    expect(scripts).toBe(0)
    expect(text).toContain("danach")

    const withScript = await render("<script>alert(1)</script> Text")
    expect(withScript.scripts).toBe(0)
  })

  it("oeffnet Links extern und laesst den Kartenklick nicht durch", async () => {
    const { html } = await render("[Utopia](https://utopia-lab.org)")
    expect(html).toContain('href="https://utopia-lab.org"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
