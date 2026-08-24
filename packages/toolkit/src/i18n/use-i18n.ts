"use client"

import { useMemo, useSyncExternalStore } from "react"

import { getI18n, getLanguage, subscribeLanguage, type I18n } from "./runtime"

/**
 * Übersetzung und Formatierung für Komponenten — Abo inklusive (rls#290).
 *
 * `t` und die Formatierer gibt es in React NUR über diesen Hook: wer sie
 * benutzt, ist damit zwangsläufig auf den Sprachwechsel abonniert, und die
 * Komponente rendert nach dem Umschalten neu. Einen separaten „Subscription-
 * Hook", den man vergessen könnte, gibt es absichtlich nicht mehr.
 *
 * Das Bündel wechselt seine Identität genau beim Sprachwechsel — es taugt
 * damit als Dependency für `useMemo`/`useCallback` über übersetzten Werten.
 */
export function useI18n(): I18n {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getI18n() hängt nur von der Sprache ab
  return useMemo(() => getI18n(), [language])
}
