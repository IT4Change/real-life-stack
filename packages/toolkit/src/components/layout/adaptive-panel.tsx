"use client"

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react"
import { cn } from "../../lib/utils"
import { useIsCompact } from "../../hooks/use-mobile"
import { X, Maximize2, PanelRight, GripHorizontal, Pin, PinOff } from "lucide-react"

export type PanelMode = "modal" | "sidebar" | "drawer"

export interface DrawerSnapConfig {
  /** Lower snap point as fraction of viewport height (default 0.2) — below this minus zone → close */
  lower?: number
  /** Upper snap point as fraction of viewport height (default 0.8) — above this → maximize to 100% */
  upper?: number
  /** Size of the snap zone in viewport fraction (default 0.05) */
  zone?: number
}

export interface AdaptivePanelProps {
  children: ReactNode
  open: boolean
  onClose: () => void
  allowedModes?: PanelMode[]
  side?: "left" | "right"
  sidebarWidth?: string
  sidebarMinWidth?: string
  sidebarMaxWidth?: string
  /** Tailwind classes for modal size, e.g. "max-w-2xl max-h-[80dvh]" */
  modalClassName?: string
  /** Initial drawer height as fraction of viewport (default 0.55) */
  drawerInitialHeight?: number
  /** Snap configuration for the drawer */
  drawerSnap?: DrawerSnapConfig
  /** When pinned, the panel stays open on submit/cancel — only explicit close dismisses it */
  pinned?: boolean
  onPinnedChange?: (pinned: boolean) => void
  onModeChange?: (mode: PanelMode) => void
  onSidebarResize?: (width: number) => void
  /**
   * Temporarily hide the panel without unmounting it (content + state stay
   * alive), so a non-sidebar panel can step aside — e.g. while the user picks
   * a location on the underlying map. No effect in sidebar mode (it does not
   * cover the content area).
   */
  suspended?: boolean
  /**
   * Show the dimming backdrop behind modal / unpinned drawer. Default `true`.
   * Set `false` so the panel floats over still-interactive content — e.g. the
   * map detail sheet, where the map below stays visible and pannable.
   */
  backdrop?: boolean
  className?: string
}

const VELOCITY_THRESHOLD = 0.15
function parsePx(value: string): number {
  if (value.endsWith("px")) return parseFloat(value)
  if (value.endsWith("vw")) return (parseFloat(value) / 100) * window.innerWidth
  if (value.endsWith("rem")) return parseFloat(value) * 16
  return parseFloat(value)
}

function resolveMode(
  allowedModes: PanelMode[],
  isCompact: boolean
): PanelMode {
  const preferred = isCompact ? "drawer" : "sidebar"
  if (allowedModes.includes(preferred)) return preferred
  const fallback = "modal"
  if (allowedModes.includes(fallback)) return fallback
  return allowedModes[0]
}

// --- Mode Switch Button ---
function ModeSwitchButton({
  currentMode,
  allowedModes,
  isCompact,
  onSwitch,
}: {
  currentMode: PanelMode
  allowedModes: PanelMode[]
  isCompact: boolean
  onSwitch: (mode: PanelMode) => void
}) {
  let targetMode: PanelMode | null = null
  let Icon = Maximize2

  if (currentMode === "sidebar" && allowedModes.includes("modal")) {
    targetMode = "modal"
    Icon = Maximize2
  } else if (currentMode === "modal" && !isCompact && allowedModes.includes("sidebar")) {
    targetMode = "sidebar"
    Icon = PanelRight
  } else if (currentMode === "modal" && isCompact && allowedModes.includes("drawer")) {
    targetMode = "drawer"
    Icon = GripHorizontal
  } else if (currentMode === "drawer" && allowedModes.includes("modal")) {
    targetMode = "modal"
    Icon = Maximize2
  }

  if (!targetMode) return null

  return (
    <button
      type="button"
      onClick={() => onSwitch(targetMode!)}
      className="p-1.5 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
      aria-label={`Zu ${targetMode} wechseln`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export function AdaptivePanel({
  children,
  open,
  onClose,
  allowedModes = ["modal", "sidebar", "drawer"],
  side = "right",
  sidebarWidth: sidebarWidthProp = "400px",
  sidebarMinWidth = "280px",
  sidebarMaxWidth = "60vw",
  modalClassName,
  drawerInitialHeight = 0.55,
  drawerSnap: drawerSnapProp,
  pinned = false,
  onPinnedChange,
  onModeChange,
  onSidebarResize,
  suspended = false,
  backdrop = true,
  className,
}: AdaptivePanelProps) {
  const isCompact = useIsCompact()
  const [mode, setMode] = useState<PanelMode>(() =>
    resolveMode(allowedModes, isCompact)
  )
  const [visible, setVisible] = useState(false)
  const [animatingOut, setAnimatingOut] = useState(false)

  // Snap config with defaults
  const snapLower = drawerSnapProp?.lower ?? 0.2
  const snapUpper = drawerSnapProp?.upper ?? 0.8
  const snapZone = drawerSnapProp?.zone ?? 0.05

  // Sidebar resize state
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState(() => parsePx(sidebarWidthProp))
  const [isResizing, setIsResizing] = useState(false)
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Drawer state — drawerY is percent from top (100 = hidden, 0 = full screen)
  const [drawerY, setDrawerYState] = useState(100)
  const drawerYRef = useRef(100)
  const [isDragging, setIsDragging] = useState(false)
  const [isClosingVelocity, setIsClosingVelocity] = useState(false)
  const dragRef = useRef<{
    startY: number
    startDrawerY: number
    lastY: number
    lastTime: number
    velocitySamples: number[]
  } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  // Remember last drawer/sidebar sizes for restore after modal round-trip
  const lastDrawerYRef = useRef(100 - drawerInitialHeight * 100)
  const lastSidebarWidthRef = useRef(parsePx(sidebarWidthProp))

  // Helper to update drawerY state + ref synchronously
  const updateDrawerY = useCallback((y: number) => {
    drawerYRef.current = y
    setDrawerYState(y)
  }, [])

  // Resolve mode on viewport change
  useEffect(() => {
    const newMode = resolveMode(allowedModes, isCompact)
    if (newMode !== mode) {
      // Save current size before switching away
      if (mode === "drawer") {
        lastDrawerYRef.current = drawerYRef.current
      } else if (mode === "sidebar") {
        lastSidebarWidthRef.current = currentSidebarWidth
      }

      setMode(newMode)
      onModeChange?.(newMode)

      // When switching to drawer while already open, animate to visible position
      if (newMode === "drawer" && open) {
        const restoreY = lastDrawerYRef.current < 100
          ? lastDrawerYRef.current
          : 100 - drawerInitialHeight * 100
        updateDrawerY(100)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateDrawerY(restoreY)
          })
        })
      } else if (newMode === "sidebar") {
        setCurrentSidebarWidth(lastSidebarWidthRef.current)
      }
    }
  }, [isCompact, allowedModes])

  // Set CSS variables for content displacement
  useEffect(() => {
    const root = document.documentElement
    if (mode === "sidebar" && open && !animatingOut) {
      const width = `${currentSidebarWidth}px`
      if (side === "right") {
        root.style.setProperty("--adaptive-panel-margin-right", width)
        root.style.setProperty("--adaptive-panel-margin-left", "0px")
      } else {
        root.style.setProperty("--adaptive-panel-margin-left", width)
        root.style.setProperty("--adaptive-panel-margin-right", "0px")
      }
    } else {
      root.style.setProperty("--adaptive-panel-margin-right", "0px")
      root.style.setProperty("--adaptive-panel-margin-left", "0px")
    }
    return () => {
      root.style.setProperty("--adaptive-panel-margin-right", "0px")
      root.style.setProperty("--adaptive-panel-margin-left", "0px")
    }
  }, [mode, open, animatingOut, currentSidebarWidth, side])

  // Manual mode switch — restore remembered sizes
  const handleModeSwitch = useCallback(
    (targetMode: PanelMode) => {
      if (!allowedModes.includes(targetMode)) return

      // Save current sizes before switching away
      if (mode === "drawer") {
        lastDrawerYRef.current = drawerYRef.current
      } else if (mode === "sidebar") {
        lastSidebarWidthRef.current = currentSidebarWidth
      }

      setMode(targetMode)
      onModeChange?.(targetMode)

      // Restore sizes when switching back
      if (targetMode === "drawer") {
        const restoreY = lastDrawerYRef.current
        updateDrawerY(100)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateDrawerY(restoreY)
          })
        })
      } else if (targetMode === "sidebar") {
        setCurrentSidebarWidth(lastSidebarWidthRef.current)
      }
    },
    [allowedModes, onModeChange, mode, currentSidebarWidth]
  )

  // Track previous open state to distinguish fresh open vs mode switch
  const prevOpenRef = useRef(false)

  // Open/close animation
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open

    if (open) {
      setVisible(true)
      setAnimatingOut(false)
      // Reset scroll position on fresh open
      if (!wasOpen && contentRef.current) {
        contentRef.current.scrollTop = 0
      }
      // Only animate drawer to initial height on fresh open (not on mode switch)
      if (mode === "drawer" && !wasOpen) {
        updateDrawerY(100)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateDrawerY(100 - drawerInitialHeight * 100)
          })
        })
      }
    } else if (visible) {
      setAnimatingOut(true)
      if (mode === "drawer" && drawerYRef.current < 100) {
        updateDrawerY(100)
      }
      const timer = setTimeout(() => {
        setVisible(false)
        setAnimatingOut(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open, mode])

  // --- Drawer snap logic ---
  const resolveDrawerRelease = useCallback(
    (currentY: number, velocity: number): "close" | "snap-lower" | "maximize" | "stay" => {
      const vf = (100 - currentY) / 100

      // Velocity fling — only trigger close/maximize when position supports it
      // A fling down should close only from the lower half; a fling up should maximize only from upper half
      if (velocity > VELOCITY_THRESHOLD && vf < 0.5) return "close"
      if (velocity < -VELOCITY_THRESHOLD && vf > 0.5) return "maximize"
      // Position-based snap zones
      if (vf < snapLower - snapZone) return "close"
      if (vf < snapLower + snapZone) return "snap-lower"
      if (vf > snapUpper) return "maximize"
      return "stay"
    },
    [snapLower, snapUpper, snapZone]
  )

  // --- Drawer Pointer Events ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== "drawer") return
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setIsDragging(true)
      dragRef.current = {
        startY: e.clientY,
        startDrawerY: drawerYRef.current,
        lastY: e.clientY,
        lastTime: Date.now(),
        velocitySamples: [],
      }
    },
    [mode]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || mode !== "drawer") return

      const now = Date.now()
      const dt = now - dragRef.current.lastTime
      if (dt > 0) {
        const sample = (e.clientY - dragRef.current.lastY) / dt
        const samples = dragRef.current.velocitySamples
        samples.push(sample)
        if (samples.length > 5) samples.shift()
      }
      dragRef.current.lastY = e.clientY
      dragRef.current.lastTime = now

      const viewportH = window.innerHeight
      const deltaPixels = e.clientY - dragRef.current.startY
      const deltaPercent = (deltaPixels / viewportH) * 100
      let newY = dragRef.current.startDrawerY + deltaPercent

      if (newY < 0) newY = newY * 0.3
      if (newY > 100) {
        const overflow = newY - 100
        newY = 100 + overflow * 0.3
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        updateDrawerY(newY)
      })
    },
    [mode]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || mode !== "drawer") return
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      setIsDragging(false)

      const samples = dragRef.current.velocitySamples
      const velocity = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : 0
      const currentY = drawerYRef.current
      const action = resolveDrawerRelease(currentY, velocity)
      dragRef.current = null

      switch (action) {
        case "close":
          setIsClosingVelocity(true)
          updateDrawerY(100)
          setTimeout(() => {
            onClose()
            setIsClosingVelocity(false)
          }, 200)
          break
        case "snap-lower":
          updateDrawerY(100 - snapLower * 100)
          lastDrawerYRef.current = 100 - snapLower * 100
          break
        case "maximize":
          updateDrawerY(0)
          lastDrawerYRef.current = 0
          break
        case "stay":
          lastDrawerYRef.current = currentY
          break
      }
    },
    [mode, resolveDrawerRelease, onClose, snapLower]
  )

  // --- Sidebar Resize Pointer Events ---
  useEffect(() => {
    if (isResizing) {
      document.documentElement.classList.add("adaptive-panel-resizing")
    } else {
      document.documentElement.classList.remove("adaptive-panel-resizing")
    }
    return () => document.documentElement.classList.remove("adaptive-panel-resizing")
  }, [isResizing])

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setIsResizing(true)
      resizeDragRef.current = {
        startX: e.clientX,
        startWidth: currentSidebarWidth,
      }
    },
    [currentSidebarWidth]
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeDragRef.current) return

      const minW = parsePx(sidebarMinWidth)
      const maxW = parsePx(sidebarMaxWidth)
      const delta = side === "right"
        ? resizeDragRef.current.startX - e.clientX
        : e.clientX - resizeDragRef.current.startX
      const newWidth = Math.max(minW, Math.min(maxW, resizeDragRef.current.startWidth + delta))

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setCurrentSidebarWidth(newWidth)
        const root = document.documentElement
        const width = `${newWidth}px`
        if (side === "right") {
          root.style.setProperty("--adaptive-panel-margin-right", width)
        } else {
          root.style.setProperty("--adaptive-panel-margin-left", width)
        }
      })
    },
    [side, sidebarMinWidth, sidebarMaxWidth]
  )

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeDragRef.current) return
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      setIsResizing(false)
      lastSidebarWidthRef.current = currentSidebarWidth
      onSidebarResize?.(currentSidebarWidth)
      resizeDragRef.current = null
    },
    [currentSidebarWidth, onSidebarResize]
  )

  const handleResizeDoubleClick = useCallback(() => {
    const defaultWidth = parsePx(sidebarWidthProp)
    setCurrentSidebarWidth(defaultWidth)
    lastSidebarWidthRef.current = defaultWidth
    onSidebarResize?.(defaultWidth)
  }, [sidebarWidthProp, onSidebarResize])

  // Escape key handler — don't close when pinned
  useEffect(() => {
    if (!open || pinned) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose, pinned])

  // Lock body scroll when modal or (unpinned) drawer is open — but not while
  // suspended, so the underlying map (e.g. during location picking) behaves
  // normally.
  useEffect(() => {
    if (!suspended && open && (mode === "modal" || (mode === "drawer" && !pinned))) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open, mode, pinned, suspended])

  if (!visible && !open) return null

  const isOpen = open && !animatingOut
  const isLeft = side === "left"

  // Drawer-specific computed values
  const drawerTransition = isDragging
    ? "none"
    : isClosingVelocity
      ? "height 200ms ease-in, opacity 200ms ease-in"
      : "height 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)"

  const visibleFraction = (100 - drawerY) / 100
  const fadeStart = snapLower - snapZone
  const drawerOpacity = isClosingVelocity
    ? 0
    : visibleFraction < fadeStart
      ? Math.max(0, visibleFraction / fadeStart)
      : 1

  // --- Outer container style per mode ---
  const outerStyle: CSSProperties =
    mode === "sidebar"
      ? {
          width: isOpen ? `${currentSidebarWidth}px` : "0px",
          transition: isResizing ? "none" : "width 300ms ease-out",
        }
      : mode === "drawer"
        ? {
            // dvh, not vh: on real mobile devices the static vh is the *large*
            // viewport (system UI hidden), so a vh-sized drawer is taller than
            // the visible area and its top (e.g. the composer's type selector)
            // gets clipped off-screen. dvh tracks the visible viewport and
            // matches the drag math, which already uses window.innerHeight.
            height: `${100 - Math.max(0, drawerY)}dvh`,
            opacity: drawerOpacity,
            transition: drawerTransition,
          }
        : {}

  return (
    <>
      {/* Backdrop — modal and unpinned drawer (unless disabled via `backdrop`) */}
      {backdrop && (mode === "modal" || (mode === "drawer" && !pinned)) && (
        <div
          className={cn(
            "fixed inset-0 z-[60] bg-black/50 transition-opacity duration-200",
            mode === "modal"
              ? (isOpen ? "opacity-100" : "opacity-0")
              : (isOpen && drawerY < 90 ? "opacity-100" : "opacity-0 pointer-events-none"),
            suspended && "invisible pointer-events-none",
          )}
          onClick={onClose}
        />
      )}

      {/* Outer positioning wrapper */}
      <div
        className={cn(
          mode === "modal" && "fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none",
          mode === "sidebar" && cn(
            "fixed top-14 bottom-0 bg-background shadow-xl flex overflow-hidden z-55",
            isLeft ? "left-0" : "right-0",
          ),
          mode === "drawer" && "fixed inset-x-0 bottom-0 z-[60] pointer-events-auto",
          suspended && mode !== "sidebar" && "invisible pointer-events-none",
        )}
        style={mode === "sidebar" ? outerStyle : undefined}
      >
        {/* Inner panel — single stable container for all modes */}
        <div
          ref={panelRef}
          className={cn(
            // Modal styling
            mode === "modal" && cn(
              "relative bg-background rounded-lg border shadow-lg pointer-events-auto",
              "w-full max-w-lg max-h-[90dvh] overflow-hidden",
              "transition-all duration-200 flex flex-col",
              isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95",
              modalClassName,
            ),
            // Sidebar styling
            mode === "sidebar" && cn(
              "flex-1 flex flex-col overflow-hidden",
              isLeft ? "border-r" : "border-l",
            ),
            // Drawer styling
            mode === "drawer" && "bg-background rounded-t-xl shadow-xl flex flex-col",
            className,
          )}
          style={
            mode === "sidebar"
              ? { minWidth: `${currentSidebarWidth}px` }
              : mode === "drawer"
                ? outerStyle
                : undefined
          }
        >
          {/* Drawer drag handle */}
          {mode === "drawer" && (
            <div className="flex-shrink-0 relative">
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="flex justify-center items-center py-3 cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: "none" }}
              >
                <div
                  className={cn(
                    "w-10 h-1 rounded-full transition-all duration-150",
                    isDragging
                      ? "bg-primary w-14 h-1.5"
                      : "bg-muted-foreground/30"
                  )}
                />
              </div>
              {/* Drawer pin + mode switch */}
              <div className="absolute top-2 right-3 flex items-center gap-0.5">
                {onPinnedChange && (
                  <button
                    type="button"
                    onClick={() => onPinnedChange(!pinned)}
                    className={cn(
                      "p-1.5 rounded-sm transition-opacity",
                      pinned ? "opacity-100 text-primary" : "opacity-60 hover:opacity-100"
                    )}
                    aria-label={pinned ? "Loslösen" : "Anheften"}
                  >
                    {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                )}
                <ModeSwitchButton
                  currentMode={mode}
                  allowedModes={allowedModes}
                  isCompact={isCompact}
                  onSwitch={handleModeSwitch}
                />
              </div>
            </div>
          )}

          {/* Sidebar resize handle */}
          {mode === "sidebar" && (
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onDoubleClick={handleResizeDoubleClick}
              className={cn(
                "absolute top-0 bottom-0 w-3 cursor-col-resize z-10 group flex items-center justify-center",
                isLeft ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"
              )}
              style={{ touchAction: "none" }}
            >
              <div
                className={cn(
                  "w-[2px] h-8 rounded-full transition-all duration-150",
                  isResizing
                    ? "bg-primary w-1 h-12"
                    : "bg-border group-hover:bg-primary/50 group-hover:w-1 group-hover:h-12"
                )}
              />
            </div>
          )}

          {/* Close + pin + mode switch buttons (modal and sidebar) */}
          {mode !== "drawer" && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5">
              {onPinnedChange && mode === "sidebar" && (
                <button
                  type="button"
                  onClick={() => onPinnedChange(!pinned)}
                  className={cn(
                    "p-1.5 rounded-sm transition-opacity",
                    pinned ? "opacity-100 text-primary" : "opacity-60 hover:opacity-100"
                  )}
                  aria-label={pinned ? "Loslösen" : "Anheften"}
                >
                  {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              )}
              <ModeSwitchButton
                currentMode={mode}
                allowedModes={allowedModes}
                isCompact={isCompact}
                onSwitch={handleModeSwitch}
              />
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Schliessen</span>
              </button>
            </div>
          )}

          {/* Content — always the same React node, never unmounted on mode switch */}
          <div
            ref={contentRef}
            className={cn(
              "flex-1 overflow-y-auto",
              mode === "drawer" && "px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
            )}
            style={mode === "modal" ? { maxHeight: "inherit" } : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
