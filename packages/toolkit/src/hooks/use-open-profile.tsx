import { createContext, useContext, useMemo, type ReactNode } from "react"

/**
 * Imperative handle to open a profile view for a user. The actual
 * implementation lives in the App Shell — depending on the host app it
 * might open the own-profile editor (when the userId matches the
 * current user) or a read-only view for another user.
 *
 * The toolkit ships only the contract: a hook + a provider. App Shells
 * decide what "open profile" means and wire the dialog/route there.
 */
export type OpenProfile = (userId: string) => void

const OpenProfileContext = createContext<OpenProfile | null>(null)

export interface OpenProfileProviderProps {
  openProfile: OpenProfile
  children: ReactNode
}

export function OpenProfileProvider({ openProfile, children }: OpenProfileProviderProps) {
  // Memoize so child consumers don't re-render when the host re-renders
  // with an unchanged handler.
  const value = useMemo(() => openProfile, [openProfile])
  return <OpenProfileContext.Provider value={value}>{children}</OpenProfileContext.Provider>
}

/**
 * Returns an `(userId: string) => void` callback that opens the user's
 * profile, or a no-op if no `OpenProfileProvider` is mounted above.
 *
 * The no-op fallback means avatar-click sites can call this hook
 * unconditionally without breaking stories or test harnesses that
 * don't bother to wire a provider.
 */
export function useOpenProfile(): OpenProfile {
  return useContext(OpenProfileContext) ?? noop
}

const noop: OpenProfile = () => {}
