"use client"

import { useSyncExternalStore } from "react"

import { getLanguage, subscribeLanguage } from "./runtime"
import type { Language } from "./runtime"

/**
 * Abonniert die aktive Sprache.
 *
 * Das ist der EINZIGE Weg, auf dem eine Komponente vom Sprachwechsel erfährt:
 * `t()` und die Formatierer lesen die Sprache zum Aufrufzeitpunkt, aber erst
 * dieser Hook sorgt dafür, dass der Aufruf nach dem Wechsel erneut passiert.
 * Eine Komponente, die übersetzt oder Datum/Zeit anzeigt und diesen Hook nicht
 * ruft, bleibt beim Umschalten sichtbar auf der alten Sprache stehen.
 */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
}
