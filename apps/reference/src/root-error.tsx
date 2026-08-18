import { useRouteError } from 'react-router-dom'

/**
 * Wurzel-Fehleranzeige — als `errorElement` der Route, nicht als Grenze um den
 * `RouterProvider`.
 *
 * `createBrowserRouter` setzt für jede Route intern eine eigene
 * `RenderErrorBoundary` ein. Eine Grenze AUSSERHALB des Providers sieht einen
 * Render-Fehler der Route deshalb nie — der Router fängt ihn vorher ab und
 * zeigt seine eigene englische „Unexpected Application Error"-Seite. Genau die
 * war Anlass dieses PRs; ein Auffangnetz daneben hätte nichts geändert.
 *
 * Bewusst OHNE „Erneut versuchen": auf dieser Ebene ist der ganze Baum hin, und
 * ein Zurücksetzen würde denselben Fehler sofort wiederholen. Neuladen ist die
 * einzige Handlung, die hier etwas ändert.
 */
export function RootError() {
  const error = useRouteError()
  // `useRouteError()` liefert, was geworfen wurde — das muss kein Error sein.
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base font-medium">Die App konnte nicht geladen werden</p>
      <p className="max-w-sm break-words font-mono text-xs text-muted-foreground">{message}</p>
      <button
        type="button"
        className="mt-2 rounded-md border px-3 py-1.5 text-sm"
        onClick={() => window.location.reload()}
      >
        Neu laden
      </button>
    </div>
  )
}
