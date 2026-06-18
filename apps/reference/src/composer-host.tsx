import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import {
  ContentComposer,
  nominatimGeocode,
  nominatimReverseGeocode,
  useItemEditor,
  useModulePanel,
  type ContentTypeConfig,
  type ItemEditorMapper,
  type WidgetData,
} from "@real-life-stack/toolkit"
import { useLocationPick } from "./location-pick"

export interface OpenComposerConfig {
  contentTypes: ContentTypeConfig[]
  /** Field mapping from composer submission → item payload (per module). */
  mapper: ItemEditorMapper
  /** Prefill the composer's widget data — e.g. a clicked calendar date as `start`. */
  initialData?: Partial<WidgetData>
  className?: string
}

interface ComposerHostValue {
  /** Open a create composer in the shared panel. */
  openComposer: (config: OpenComposerConfig) => void
}

const ComposerHostContext = createContext<ComposerHostValue | null>(null)

/**
 * App-level host for the create composer. Owns a single `useItemEditor` and
 * renders the `ContentComposer` into the shared module panel. Because the host
 * lives above the ModuleOutlet, the editor + the composer content survive a
 * module switch — which is what makes "open composer in Calendar → pick a
 * position on the Map → come back and save" robust (the save path is not tied
 * to the unmounted origin view).
 *
 * The per-module field mapping is provided at open time and held in a ref, so
 * a single shared editor serves every module without recreating it.
 */
export function ComposerHostProvider({
  children,
  currentUserId,
}: {
  children: ReactNode
  currentUserId?: string
}) {
  const modulePanel = useModulePanel()
  const { startPick, confirmPick, isPicking } = useLocationPick()
  const mapperRef = useRef<ItemEditorMapper>(() => null)
  const mapSubmission = useCallback<ItemEditorMapper>(
    (submission, ctx) => mapperRef.current(submission, ctx),
    [],
  )
  const editor = useItemEditor({ currentUserId, mapSubmission })

  // Refs so the frozen ContentComposer element (held in the panel across module
  // switches) always reaches the latest editor — e.g. once the current user
  // resolves, so a create does not fall back to createdBy "anonymous" — and the
  // live picking state when it closes.
  const editorRef = useRef(editor)
  editorRef.current = editor
  const isPickingRef = useRef(isPicking)
  isPickingRef.current = isPicking
  const confirmPickRef = useRef(confirmPick)
  confirmPickRef.current = confirmPick

  // If the composer is replaced by other panel content (or closed) while a pick
  // is in flight, the entry's onClose does not fire on a content-swap — so end
  // the pick here to avoid a stuck state (composer suspended / map stuck in
  // pick mode).
  useEffect(() => {
    if (isPicking && modulePanel.current?.kind !== "composer") confirmPick()
  }, [isPicking, modulePanel, confirmPick])

  const openComposer = useCallback(
    (config: OpenComposerConfig) => {
      mapperRef.current = config.mapper
      editorRef.current.openCreate()
      modulePanel.open({
        kind: "composer",
        content: (
          <ContentComposer
            className={config.className ?? "p-4 sm:p-6"}
            contentTypes={config.contentTypes}
            initialData={config.initialData}
            showPreview={false}
            geocode={nominatimGeocode}
            reverseGeocode={nominatimReverseGeocode}
            requestMapPick={startPick}
            onSubmit={async (data) => {
              const result = await editorRef.current.submit(data)
              if (result) {
                modulePanel.close()
                return
              }
              // submit() swallows the connector error into editor.error (React
              // state, not readable synchronously here) and returns null. For
              // these mappers a null result always means a real failure (they
              // never abort), so signal it so the composer shows its error.
              throw new Error("Speichern fehlgeschlagen. Bitte erneut versuchen.")
            }}
            onCancel={() => modulePanel.close()}
          />
        ),
        onClose: () => {
          editorRef.current.close()
          // Closing the composer also ends any in-flight map pick.
          if (isPickingRef.current) confirmPickRef.current()
        },
      })
    },
    [modulePanel, startPick],
  )

  const value = useMemo<ComposerHostValue>(() => ({ openComposer }), [openComposer])
  return <ComposerHostContext.Provider value={value}>{children}</ComposerHostContext.Provider>
}

export function useComposerHost(): ComposerHostValue {
  const ctx = useContext(ComposerHostContext)
  if (!ctx) {
    throw new Error("useComposerHost must be used inside <ComposerHostProvider>")
  }
  return ctx
}
