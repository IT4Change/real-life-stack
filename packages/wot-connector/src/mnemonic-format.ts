/**
 * Magic-Words-Format — UX-Vertrag, paritätisch zur WoT-Demo-App:
 * Kopieren liefert 12 nummerierte Zeilen (Reihenfolge bleibt beim Übertragen
 * prüfbar); der Import-Parser normalisiert alle gängigen Einfüge-Formate
 * (nummerierte Zeilen, Inline-Nummerierung mit/ohne Punkt, plain) zurück auf
 * die reine Wortfolge. Safe, weil kein BIP39-Wort mit einer Ziffer beginnt.
 */

export function formatMnemonicForCopy(words: readonly string[]): string {
  return words.map((word, i) => `${i + 1}. ${word}`).join("\n")
}

export function cleanMnemonicInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/[\n\r]+/)
    .map((line) => line.trim().replace(/^\d+[.):\-]\s*/, ""))
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((token) => token.replace(/^\d+[.):\-]+/, ""))
    .filter((token) => token.length > 0 && !/^\d+$/.test(token))
    .join(" ")
}
