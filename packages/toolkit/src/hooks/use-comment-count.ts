import { useEffect, useMemo, useState, startTransition } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { hasRelations } from "@real-life-stack/data-interface"
import { useOptionalConnector } from "./connector-context"

/**
 * Number of comments on an item — the cheap counterpart to {@link useComments}.
 *
 * Cards only need "is there a discussion, and how big", not the threaded list
 * with resolved authors. Same observable as `useComments` (`commentOn`,
 * direction `to`), so both stay consistent and the connector can share the
 * subscription; per-card subscriptions follow the pattern reactions already
 * use. Counts replies too — a card should show that a thread exists, not just
 * its first level.
 *
 * Returns 0 without a connector or on connectors without relations, so
 * callers need no guard.
 */
export function useCommentCount(itemId: string): number {
  // Optional on purpose: ItemPreview renders without a ConnectorProvider
  // (tests, SSR, isolated previews) and must not throw there — it simply
  // shows no comment hint.
  const connector = useOptionalConnector()
  const supportsRelations = connector !== null && hasRelations(connector)

  const observable = useMemo(
    () => (connector && supportsRelations ? connector.observeRelatedItems(itemId, "commentOn", { direction: "to" }) : null),
    [connector, supportsRelations, itemId],
  )

  const [comments, setComments] = useState<Item[]>(observable?.current ?? [])
  useEffect(() => {
    if (!observable) {
      setComments([])
      return
    }
    setComments(observable.current)
    return observable.subscribe((items) => startTransition(() => setComments(items)))
  }, [observable])

  return comments.length
}
