import { useCallback, useEffect } from "react"
import { useBlocker, type Location } from "react-router-dom"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useUnsavedChanges,
} from "@real-life-stack/toolkit"

/** Does this navigation leave the create/edit context (i.e. discard the open
 *  composer)? True only when we were composing (`?compose`/`?edit`) and the
 *  target no longer is. Navigations that stay in context — switching modules
 *  while creating (the query is carried), the map-pick detour — keep the param
 *  and pass through, so they're never blocked. */
function leavesComposer(current: Location, next: Location): boolean {
  const cur = new URLSearchParams(current.search)
  const dst = new URLSearchParams(next.search)
  const wasComposing = cur.has("compose") || cur.has("edit")
  const stillComposing = dst.has("compose") || dst.has("edit")
  return wasComposing && !stillComposing
}

/**
 * Warns before unsaved composer content is discarded. One mechanism covers every
 * path that could lose it:
 * - in-app navigation (cancel, opening another item) and browser-back →
 *   react-router's `useBlocker`, gated on {@link leavesComposer};
 * - hard reload / tab close / external nav → the native `beforeunload` prompt.
 *
 * Only armed while a composer reports unsaved changes (see `useUnsavedChanges`),
 * so an untouched or empty form never triggers it. Mounted once, under the
 * router and the `UnsavedChangesProvider`.
 */
export function UnsavedChangesGuard() {
  const unsaved = useUnsavedChanges()
  const dirtyRef = unsaved?.dirtyRef
  const dirty = unsaved?.dirty ?? false

  const shouldBlock = useCallback(
    ({ currentLocation, nextLocation }: { currentLocation: Location; nextLocation: Location }) =>
      !!dirtyRef?.current && leavesComposer(currentLocation, nextLocation),
    [dirtyRef],
  )
  const blocker = useBlocker(shouldBlock)

  // Hard unload (refresh / close tab / navigate to an external URL): SPA blockers
  // don't see these, so fall back to the browser's native confirmation.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const blocked = blocker.state === "blocked"
  return (
    <Dialog open={blocked} onOpenChange={(open) => { if (!open) blocker.reset?.() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Änderungen verwerfen?</DialogTitle>
          <DialogDescription>
            Du hast ungespeicherte Änderungen. Wenn du fortfährst, gehen sie verloren.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Weiter bearbeiten
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Verwerfen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
