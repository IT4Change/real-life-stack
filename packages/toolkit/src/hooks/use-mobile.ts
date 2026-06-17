import * as React from "react"

const MOBILE_BREAKPOINT = 768
const COMPACT_BREAKPOINT = 1024

function useBelowBreakpoint(breakpoint: number) {
  const [below, setBelow] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => setBelow(window.innerWidth < breakpoint)
    mql.addEventListener("change", onChange)
    setBelow(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!below
}

export function useIsMobile() {
  return useBelowBreakpoint(MOBILE_BREAKPOINT)
}

/**
 * True below the panel breakpoint — i.e. where the AdaptivePanel switches from
 * a sidebar to a drawer (and a suspended panel is actually hidden).
 */
export function useIsCompact() {
  return useBelowBreakpoint(COMPACT_BREAKPOINT)
}
