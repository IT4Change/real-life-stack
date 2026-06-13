import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react"
import { Routes, Route, useNavigate } from "react-router-dom"
import {
  Plus,
  Sun,
  Moon,
} from "lucide-react"

import {
  AppShell,
  AppShellMain,
  Navbar,
  NavbarStart,
  NavbarCenter,
  NavbarEnd,
  WorkspaceSwitcher,
  UserMenu,
  ModuleTabs,
  BottomNav,
  ConnectorSwitcher,
  Button,
  GroupDialog,
  AdaptivePanel,
  OpenProfileProvider,
  ProfilePanelContent,
  type ProfileData,
  ContactsDialog,
  VerificationDialog,
  IncomingVerificationDialog,
  IncomingSpaceInviteDialog,
  MutualVerificationDialog,
  RelayStatusBadge,
  IncomingEventsProvider,
  useIncomingEvents,
  ConnectorProvider,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useInviteMember,
  useRemoveMember,
  useCurrentUser,
  useConnector,
  useContacts,
  useVerification,
  useRelayStatus,
  type Workspace,
  type UserData,
  type ConnectorOption,
  type GroupDialogMode,
} from "@real-life-stack/toolkit"
import type { DataInterface, User } from "@real-life-stack/data-interface"
import { isAuthenticatable, hasMessaging, hasEncounterVerification, hasProfile } from "@real-life-stack/data-interface"
import { demoItems, demoGroups, demoUsers, demoGroupMembers, demoGroupItems } from "@real-life-stack/data-interface/demo-data"
import { MockConnector } from "@real-life-stack/mock-connector"
import { LocalConnector } from "@real-life-stack/local-connector"
import { ModuleOutlet } from "./views/module-outlet"
import { useWorkspaceRouting, STORAGE_KEY_GROUP } from "./hooks/use-workspace-routing"

const CONNECTOR_OPTIONS: ConnectorOption[] = [
  { id: "mock", name: "Mock", description: "In-Memory, kein Speichern" },
  { id: "local", name: "Local", description: "IndexedDB, persistent" },
  { id: "wot", name: "Web of Trust", description: "E2E-verschlüsselt, Multi-Device" },
]

const DebugDashboard = lazy(() =>
  import("@real-life-stack/toolkit").then((m) => ({ default: m.DebugDashboard }))
)

function RelayStatusBadgeWrapper({ onOpenDebug }: { onOpenDebug: () => void }) {
  const { state, pendingCount } = useRelayStatus()
  return (
    <RelayStatusBadge
      state={state}
      pendingCount={pendingCount}
      onClick={onOpenDebug}
    />
  )
}

/**
 * Global incoming event dialogs — counter-verify, space invite, mutual verification.
 * Must be rendered inside IncomingEventsProvider.
 */
function IncomingEventDialogs({ onCloseVerifyDialog }: { onCloseVerifyDialog?: () => void }) {
  const connector = useConnector()
  const { data: currentUser } = useCurrentUser()
  const { incomingVerification, spaceInvite, mutualVerification, dismiss } = useIncomingEvents()

  const handleCounterVerify = async () => {
    if (!incomingVerification || !hasEncounterVerification(connector)) return
    await connector.counterVerify(incomingVerification.fromId)
    dismiss()
  }

  const navigate = useNavigate()
  const handleOpenSpace = () => {
    if (spaceInvite) {
      navigate(`/spaces/${spaceInvite.spaceId}/feed`)
    }
    dismiss()
  }

  // Close the verify dialog when an incoming/mutual verification arrives
  useEffect(() => {
    if (incomingVerification || mutualVerification) onCloseVerifyDialog?.()
  }, [incomingVerification, mutualVerification, onCloseVerifyDialog])

  return (
    <>
      <IncomingVerificationDialog
        open={!!incomingVerification}
        fromId={incomingVerification?.fromId ?? ""}
        fromName={incomingVerification?.fromName}
        fromAvatar={incomingVerification?.fromAvatar}
        onConfirm={handleCounterVerify}
        onReject={dismiss}
      />
      <IncomingSpaceInviteDialog
        open={!!spaceInvite}
        spaceName={spaceInvite?.spaceName ?? ""}
        spaceImage={spaceInvite?.spaceImage}
        inviterName={spaceInvite?.fromName}
        onOpen={handleOpenSpace}
        onDismiss={dismiss}
      />
      <MutualVerificationDialog
        open={!!mutualVerification}
        peerName={mutualVerification?.fromName}
        peerAvatar={mutualVerification?.fromAvatar}
        myName={currentUser?.displayName}
        myAvatar={currentUser?.avatarUrl}
        onDismiss={dismiss}
      />
    </>
  )
}

/**
 * Single App-Shell-level profile surface. Holds one AdaptivePanel that
 * both the own-profile editor and read-only foreign profiles render
 * into — opened from anywhere via the OpenProfileProvider. Modal by
 * default so an avatar click inside an open item-detail sidebar stacks
 * above it instead of replacing it.
 */
function ProfilePanelHost({
  userId,
  currentUser,
  connector,
  contactCount,
  onSaveProfile,
  onClose,
}: {
  userId: string | null
  currentUser: User | null | undefined
  connector: DataInterface
  contactCount?: number
  onSaveProfile: (updates: { name: string; bio: string; avatar?: string }) => Promise<void>
  onClose: () => void
}) {
  const isOwn = userId != null && userId === currentUser?.id
  const [foreign, setForeign] = useState<User | null>(null)

  useEffect(() => {
    // Clear any previously loaded user first, so switching from one
    // foreign profile to another doesn't briefly show the stale one.
    setForeign(null)
    if (userId == null || isOwn) return
    let cancelled = false
    if (isAuthenticatable(connector)) {
      connector.getUser(userId)
        .then((u) => { if (!cancelled) setForeign(u) })
        .catch(() => { if (!cancelled) setForeign(null) })
    }
    return () => { cancelled = true }
  }, [userId, isOwn, connector])

  const profile: ProfileData | null = useMemo(() => {
    if (userId == null) return null
    if (isOwn) {
      return {
        did: currentUser?.id ?? "",
        name: currentUser?.displayName ?? "",
        bio: "",
        avatar: currentUser?.avatarUrl,
      }
    }
    // Foreign profile: use the loaded user, fall back to the bare id
    // while getUser is still resolving (or if the connector can't
    // resolve it).
    return {
      did: foreign?.id ?? userId,
      name: foreign?.displayName ?? userId,
      avatar: foreign?.avatarUrl,
    }
  }, [userId, isOwn, currentUser, foreign])

  return (
    <AdaptivePanel
      open={userId !== null}
      onClose={onClose}
      allowedModes={["modal"]}
      modalClassName="sm:max-w-sm"
    >
      {profile && (
        <ProfilePanelContent
          mode={isOwn ? "edit" : "view"}
          profile={profile}
          contactCount={isOwn ? contactCount : undefined}
          onSave={onSaveProfile}
          onClose={onClose}
        />
      )}
    </AdaptivePanel>
  )
}

function Home({ activeConnectorId, onConnectorChange }: { activeConnectorId: string; onConnectorChange: (id: string) => void }) {
  const connector = useConnector()
  const navigate = useNavigate()
  const {
    groups,
    workspaces,
    activeWorkspace,
    activeModule,
    modules,
    urlSpaceId,
    urlItemId,
    handleWorkspaceChange,
    handleModuleChange,
  } = useWorkspaceRouting()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const inviteMember = useInviteMember()
  const removeMember = useRemoveMember()
  const { data: currentUser } = useCurrentUser()
  const { activeContacts, pendingContacts, contacts: allContacts, removeContact, updateContactName, supportsContacts } = useContacts()
  const verification = useVerification()

  // Dialog state
  const [contactsDialogOpen, setContactsDialogOpen] = useState(false)
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false)
  // One id drives the shared profile panel; null = closed. The own
  // profile (id === currentUser.id) opens the editor, any other id a
  // read-only view.
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const openProfile = useCallback((userId: string) => setProfileUserId(userId), [])

  const handleSaveProfile = useCallback(async (updates: { name: string; bio: string; avatar?: string }) => {
    if (hasProfile(connector)) {
      await connector.updateMyProfile(updates)
    }
  }, [connector])

  // Group dialog state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupDialogMode, setGroupDialogMode] = useState<GroupDialogMode>({ type: "create" })
  const openCreateDialog = useCallback(() => {
    setGroupDialogMode({ type: "create" })
    setGroupDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((workspace: Workspace) => {
    if (workspace.scope === "overview") return
    const group = groups.find((g) => g.id === workspace.id)
    if (!group) return
    setGroupDialogMode({ type: "edit", group })
    setGroupDialogOpen(true)
  }, [groups])

  const userData: UserData = useMemo(
    () => ({
      id: currentUser?.id ?? "",
      name: currentUser?.displayName ?? "Laden...",
      email: "",
      avatar: currentUser?.avatarUrl,
    }),
    [currentUser]
  )

  const [isDark, setIsDark] = useState(false)
  const supportsMessaging = hasMessaging(connector)
  const [debugOpen, setDebugOpen] = useState(false)

  const toggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <OpenProfileProvider openProfile={openProfile}>
    <AppShell>
      <Navbar>
        <NavbarStart>
          {workspaces.length > 0 ? (
            // Switcher stays available even when activeWorkspace is null
            // (no-access URL) so the user can navigate to their spaces.
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onWorkspaceChange={handleWorkspaceChange}
              onCreateWorkspace={openCreateDialog}
              onEditWorkspace={openEditDialog}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4 mr-2" />
              Neue Gruppe
            </Button>
          )}
        </NavbarStart>
        <NavbarCenter>
          <ModuleTabs
            modules={modules}
            activeModule={activeModule}
            onModuleChange={handleModuleChange}
          />
        </NavbarCenter>
        <NavbarEnd>
          {supportsMessaging && <RelayStatusBadgeWrapper onOpenDebug={() => setDebugOpen(prev => !prev)} />}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <UserMenu
            user={userData}
            onProfile={() => { if (currentUser?.id) openProfile(currentUser.id) }}
            onContacts={supportsContacts ? () => setContactsDialogOpen(true) : undefined}
            contactCount={activeContacts.length}
            onVerify={() => setVerifyDialogOpen(true)}
            onLogout={isAuthenticatable(connector) ? async () => {
              await connector.logout()
              window.location.reload()
            } : undefined}
          />
        </NavbarEnd>
      </Navbar>

      <Suspense fallback={null}>
        <DebugDashboard open={debugOpen} onClose={() => setDebugOpen(false)} />
      </Suspense>

      <AppShellMain withBottomNav>
        <ModuleOutlet
          activeWorkspace={activeWorkspace}
          activeModule={activeModule}
          groups={groups}
          urlSpaceId={urlSpaceId}
          urlItemId={urlItemId}
        />
      </AppShellMain>

      <BottomNav
        items={modules}
        activeItem={activeModule}
        onItemChange={handleModuleChange}
      />
      <GroupDialog
        key={groupDialogMode.type === "edit" ? `edit-${groupDialogMode.group.id}` : "create"}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        mode={groupDialogMode}
        currentUserId={currentUser?.id}
        contacts={allContacts}
        onCreateGroup={async (name) => {
          const group = await createGroup(name)
          handleWorkspaceChange({ id: group.id, name: group.name })
        }}
        onUpdateGroup={async (id, updates) => {
          await updateGroup(id, updates)
        }}
        onDeleteGroup={async (id) => {
          await deleteGroup(id)
          // If deleted group was active, switch to first remaining
          if (activeWorkspace?.id === id) {
            const remaining = workspaces.filter((w) => w.id !== id)
            if (remaining.length > 0) {
              handleWorkspaceChange(remaining[0])
            } else {
              localStorage.removeItem(STORAGE_KEY_GROUP)
              navigate("/")
            }
          }
        }}
        onInviteMember={async (groupId, userId) => {
          await inviteMember(groupId, userId)
        }}
        onRemoveMember={async (groupId, userId) => {
          await removeMember(groupId, userId)
        }}
      />
      <ProfilePanelHost
        userId={profileUserId}
        currentUser={currentUser}
        connector={connector}
        contactCount={activeContacts.length}
        onSaveProfile={handleSaveProfile}
        onClose={() => setProfileUserId(null)}
      />

      {/* Contacts Dialog */}
      <ContactsDialog
        open={contactsDialogOpen}
        onOpenChange={setContactsDialogOpen}
        activeContacts={activeContacts}
        pendingContacts={pendingContacts}
        onRemove={removeContact}
        onEditName={updateContactName}
        onVerify={() => { setContactsDialogOpen(false); setVerifyDialogOpen(true) }}
      />

      <VerificationDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        challenge={verification.challenge}
        peerInfo={verification.peerInfo}
        isProcessing={verification.isProcessing}
        error={verification.error}
        onCreateChallenge={verification.createChallenge}
        onScanChallenge={verification.scanChallenge}
        onConfirmVerification={verification.confirmVerification}
        onReset={verification.reset}
      />

      {/* Incoming event dialogs */}
      <IncomingEventDialogs onCloseVerifyDialog={() => setVerifyDialogOpen(false)} />

      {/* Connector FAB — bottom-left, above BottomNav (only with ?dev URL param) */}
      {initialDevMode && (
        <div className="fixed bottom-20 left-4 z-50">
          <ConnectorSwitcher
            connectors={CONNECTOR_OPTIONS}
            activeConnector={activeConnectorId}
            onConnectorChange={onConnectorChange}
          />
        </div>
      )}
    </AppShell>
    </OpenProfileProvider>
  )
}

const demoData = {
  items: demoItems,
  groups: demoGroups,
  users: demoUsers,
  groupMembers: demoGroupMembers,
  groupItems: demoGroupItems,
}

async function createConnector(type: string): Promise<DataInterface> {
  if (type === "wot") {
    const { WotConnector } = await import("@real-life-stack/wot-connector")
    const connector = new WotConnector({
      relayUrl: import.meta.env.VITE_RELAY_URL ?? "wss://relay.utopia-lab.org",
      profilesUrl: import.meta.env.VITE_PROFILE_SERVICE_URL ?? "https://profiles.utopia-lab.org",
      vaultUrl: import.meta.env.VITE_VAULT_URL ?? "https://vault.utopia-lab.org",
    })
    await connector.init()
    return connector
  }
  if (type === "local") {
    const c = new LocalConnector(demoData)
    await c.init()
    return c
  }
  const c = new MockConnector()
  await c.init()
  return c
}

const STORAGE_KEY_CONNECTOR = "rls-connector"
const initialDevMode = new URLSearchParams(window.location.search).has('dev')

function getInitialConnectorId(): string {
  const params = new URLSearchParams(window.location.search)
  const envDefault = import.meta.env.VITE_DEFAULT_CONNECTOR as string | undefined
  return params.get("connector") ?? envDefault ?? localStorage.getItem(STORAGE_KEY_CONNECTOR) ?? "wot"
}

// Lazy-load the DIDAuthScreen to keep WoT bundle separate
const LazyDIDAuthScreen = lazy(() =>
  import("@real-life-stack/wot-connector/components").then((m) => ({
    default: m.DIDAuthScreen,
  }))
)

function AuthGate({ connector, children }: { connector: DataInterface; children: React.ReactNode }) {
  // Only check auth state once at mount — do NOT subscribe to changes.
  // The DIDAuthScreen controls when onAuthenticated fires (after seed backup etc.),
  // so reacting to auth state changes would skip the onboarding wizard.
  const [authenticated, setAuthenticated] = useState(() => {
    if (!isAuthenticatable(connector)) return true
    return connector.getAuthState().current.status === "authenticated"
  })

  if (authenticated) {
    return <>{children}</>
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Lade Auth…</div>
        </div>
      }
    >
      <LazyDIDAuthScreen
        connector={connector as unknown as import("@real-life-stack/wot-connector").WotConnector}
        onAuthenticated={() => setAuthenticated(true)}
      />
    </Suspense>
  )
}

export default function App() {
  const [connectorId, setConnectorId] = useState(getInitialConnectorId)
  const [connector, setConnector] = useState<DataInterface | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONNECTOR, connectorId)
    setLoading(true)
    setConnector(null)
    let cancelled = false
    let instance: DataInterface | null = null
    createConnector(connectorId).then((c) => {
      if (cancelled) return // Don't dispose — global singletons (PersonalDoc) are shared
      instance = c
      setConnector(c)
      setLoading(false)
    }).catch((err) => {
      console.error("[App] Failed to create connector:", err)
      if (!cancelled) setLoading(false) // Show empty state instead of infinite loader
    })
    return () => {
      cancelled = true
      // Only dispose on real unmount (connector switch), not Strict Mode re-mount.
      // We detect this by checking if the connector was actually set.
      if (instance) {
        instance.dispose()
      }
    }
  }, [connectorId])

  if (loading || !connector) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Lade {CONNECTOR_OPTIONS.find((o) => o.id === connectorId)?.name ?? connectorId}…
        </div>
      </div>
    )
  }

  return (
    <ConnectorProvider connector={connector} key={connectorId}>
      <IncomingEventsProvider>
        <AuthGate connector={connector}>
          <Routes>
            <Route path="spaces/:spaceId/:module/item/:itemId" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="spaces/:spaceId/item/:itemId" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="spaces/:spaceId/:module" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="spaces/:spaceId" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="profile" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="contacts" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            <Route path="*" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
          </Routes>
        </AuthGate>
      </IncomingEventsProvider>
    </ConnectorProvider>
  )
}
