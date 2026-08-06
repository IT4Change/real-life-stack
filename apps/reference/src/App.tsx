import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense, type ReactNode } from "react"
import { Routes, Route, useNavigate, useSearchParams, useLocation } from "react-router-dom"
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
  DraftItemProvider,
  UnsavedChangesProvider,
  ModulePanelProvider,
  useModulePanel,
  DebugDashboard,
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
  useCurrentGroup,
  useCurrentUser,
  useMembers,
  useConnector,
  useContacts,
  useVerification,
  useRelayStatus,
  ActivityBell,
  ActivityPanel,
  useActivity,
  NotificationBell,
  NotificationCenter,
  useNotifications,
  useMarkNotificationsSeen,
  useItems,
  type Workspace,
  type UserData,
  type ConnectorOption,
  type GroupDialogMode,
  AuthScreen,
  AddContactDialog,
  IncomingContactRequestDialog,
} from "@real-life-stack/toolkit"
import type { DataInterface, User } from "@real-life-stack/data-interface"
import { isAuthenticatable, hasMessaging, hasEncounterVerification, hasProfile, moduleHintsFor } from "@real-life-stack/data-interface"
import { demoItems, demoGroups, demoUsers, demoGroupMembers, demoGroupItems } from "@real-life-stack/data-interface/demo-data"
import { MockConnector } from "@real-life-stack/mock-connector"
import { LocalConnector } from "@real-life-stack/local-connector"
import { ModuleOutlet } from "./views/module-outlet"
import { useWorkspaceRouting, STORAGE_KEY_GROUP } from "./hooks/use-workspace-routing"
import { buildNotificationRoute, moduleCanDisplay } from "./notification-navigation"
import { ItemFocusProvider } from "./hooks/use-item-focus"
import { LocationPickProvider, useLocationPick } from "./location-pick"
import { CreateHostProvider, CreateSheetController } from "./create-host"
import { DetailHostProvider, DetailHostController } from "./detail-host"
import { UnsavedChangesGuard } from "./unsaved-changes-guard"
import { useItemFocus } from "./hooks/use-item-focus"

/**
 * Renders the single app-level ModulePanel and suspends it (hidden, kept
 * mounted) while the user picks a location on the map — so the drawer steps
 * aside on mobile. Lives inside LocationPickProvider to read `isPicking`.
 */
function ModulePanelHost({ children, onDrawerHeightChange }: { children: ReactNode; onDrawerHeightChange: (height: number) => void }) {
  const { isPicking } = useLocationPick()
  return (
    // No "modal" mode (drops the maximise/mode-switch) and no pinning — both were
    // controls without a real use in the detail panel (Pin does nothing in a
    // sidebar; maximise hides the context, esp. on the map). Chrome is just the
    // close button; item actions live in the card header (ItemDetailActions).
    <ModulePanelProvider
      allowedModes={["sidebar", "drawer"]}
      sidebarWidth="420px"
      sidebarMinWidth="300px"
      sidebarMaxWidth="70vw"
      suspended={isPicking}
      onDrawerHeightChange={onDrawerHeightChange}
    >
      {children}
    </ModulePanelProvider>
  )
}

/**
 * Accepts either a raw user id or a shared profile URL (…?profile=<id>) in
 * the add-contact input — people paste what they got.
 */
function extractProfileId(input: string): string {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    const fromParam = url.searchParams.get("profile")
    if (fromParam) return fromParam
  } catch {
    // not a URL — treat as raw id
  }
  return trimmed
}

/** Meta-item types the shell has no detail projection for (log stays visible, not clickable). */
const UNPROJECTABLE_TARGET_TYPES = new Set(["relation", "comment"])

/** Activity deliberately shares the module panel instead of adding a second shell overlay. */
function ActivityPanelController({ open, onClose, onOpenNotification, onOpenGroup, onOpenEntryTarget }: { open: boolean; onClose: () => void; onOpenNotification: (notification: import("@real-life-stack/toolkit").NotificationCandidate) => void; onOpenGroup: (groupId: string) => void; onOpenEntryTarget: (targetId: string) => void }) {
  const panel = useModulePanel()
  const { clearFocus } = useItemFocus()
  const ownedActivityPanel = useRef(false)
  const wasOpen = useRef(open)
  const openTarget = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    onOpenEntryTarget(entry.targetId)
    onClose()
  }, [onOpenEntryTarget, onClose])
  useEffect(() => {
    const openedNow = open && !wasOpen.current
    wasOpen.current = open
    if (!open) {
      ownedActivityPanel.current = false
      if (panel.current?.itemId === "__activity__") panel.close({ silent: true })
      return
    }
    if (panel.current?.itemId === "__activity__") {
      ownedActivityPanel.current = true
      return
    }
    // A content swap does not invoke the previous panel's onClose. Yield the
    // shared shell instead of reclaiming it from the new owner.
    if (ownedActivityPanel.current && !openedNow) {
      ownedActivityPanel.current = false
      onClose()
      return
    }
    ownedActivityPanel.current = true
    // Like starting a create, opening the history DROPS the item focus: the
    // shared panel shows exactly one thing, and only a focus CHANGE hands it
    // back to the detail host. Keeping a stale focus would make clicking the
    // same item a no-op (no focus change → no detail reopen).
    clearFocus()
    panel.open({
      kind: "custom",
      itemId: "__activity__",
      content: <ReferenceNotificationCenterContent onOpenTarget={openTarget} onOpenNotification={onOpenNotification} onOpenGroup={onOpenGroup} onCloseCenter={onClose} onOpenActivity={() => panel.open({ kind: "custom", itemId: "__activity__", content: <ReferenceActivityPanelContent onOpenTarget={openTarget} />, onClose })} />,
      onClose,
    })
  }, [clearFocus, onClose, open, openTarget, panel.close, panel.current?.itemId, panel.open])
  return null
}

function ReferenceNotificationCenterContent({ onOpenTarget, onOpenNotification, onOpenGroup, onOpenActivity, onCloseCenter }: { onOpenTarget: (entry: import("@real-life-stack/data-interface").ActivityEntry) => void; onOpenNotification: (notification: import("@real-life-stack/toolkit").NotificationCandidate) => void; onOpenGroup: (groupId: string) => void; onOpenActivity: () => void; onCloseCenter: () => void }) {
  const notifications = useNotifications()
  useMarkNotificationsSeen(notifications)
  if (!notifications.supported) return <ReferenceActivityPanelContent onOpenTarget={onOpenTarget} />
  return <NotificationCenter notifications={notifications.notifications} onOpenSubject={onOpenNotification} onOpenGroup={onOpenGroup} onOpenActivity={onOpenActivity} onMarkRead={notifications.stateSupported ? (keys) => void notifications.update?.({ op: "markRead", keys }) : undefined} onMarkAllRead={notifications.stateSupported ? () => { if (notifications.maxTs) void notifications.update?.({ op: "markAllReadUpTo", ts: notifications.maxTs }); onCloseCenter() } : undefined} onMuteGroup={notifications.stateSupported ? (groupId, muted) => void notifications.update?.(muted ? { op: "mute", groupId } : { op: "unmute", groupId }) : undefined} />
}

function ReferenceActivityPanelContent({ onOpenTarget }: { onOpenTarget: (entry: import("@real-life-stack/data-interface").ActivityEntry) => void }) {
  const { data: entries } = useActivity()
  const { data: items } = useItems()
  const currentGroup = useCurrentGroup()
  const { data: members } = useMembers(currentGroup?.id ?? null)
  const { data: currentUser } = useCurrentUser()
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  // A reaction entry opens its PARENT (the reacted-to item) — the reaction
  // itself has no detail projection.
  const resolveOpenId = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    if (UNPROJECTABLE_TARGET_TYPES.has(entry.targetType) || entry.action === "delete") return undefined
    if (entry.targetType === "reaction") {
      const reaction = itemById.get(entry.targetId)
      const target = reaction?.relations?.find((relation) => relation.predicate === "reactsTo")?.target
      const parentId = target?.startsWith("item:") ? target.slice("item:".length) : undefined
      return parentId && itemById.has(parentId) ? parentId : undefined
    }
    return itemById.has(entry.targetId) ? entry.targetId : undefined
  }, [itemById])
  const isTargetOpenable = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => resolveOpenId(entry) !== undefined, [resolveOpenId])
  const resolveActor = useCallback(
    (actorId: string) => members.find((member) => member.id === actorId) ?? (currentUser?.id === actorId ? currentUser : undefined),
    [members, currentUser],
  )
  const openResolvedTarget = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    const openId = resolveOpenId(entry)
    if (openId) onOpenTarget({ ...entry, targetId: openId })
  }, [onOpenTarget, resolveOpenId])
  return <ActivityPanel entries={entries} isTargetOpenable={isTargetOpenable} onOpenTarget={openResolvedTarget} resolveActor={resolveActor} />
}

const CONNECTOR_OPTIONS: ConnectorOption[] = [
  { id: "mock", name: "Mock", description: "In-Memory, kein Speichern" },
  { id: "local", name: "Local", description: "IndexedDB, persistent" },
  { id: "wot", name: "Web of Trust", description: "E2E-verschlüsselt, Multi-Device" },
  { id: "supabase", name: "Supabase", description: "PostgreSQL-Backend, Realtime" },
]

function RelayStatusBadgeWrapper() {
  const { state, pendingCount } = useRelayStatus()
  const panel = useModulePanel()
  // Debug shares the one app-level panel (content-swap). Toggle: a badge
  // click opens debug into the panel, or closes it if it's already showing.
  const toggleDebug = () => {
    if (panel.current?.kind === "debug") {
      panel.close()
    } else {
      panel.open({
        kind: "debug",
        content: <DebugDashboard />,
      })
    }
  }
  return (
    <RelayStatusBadge
      state={state}
      pendingCount={pendingCount}
      onClick={toggleDebug}
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
  const { current: currentNotification, incomingVerification, spaceInvite, mutualVerification, contactRequest, contactConfirmed, dismiss } = useIncomingEvents()
  const { activateContact: activateIncomingContact } = useContacts()

  const handleConfirmContactRequest = async () => {
    if (!contactRequest) return
    // Fehler NICHT schlucken: der Dialog zeigt ihn und bleibt offen
    // (retry-fähig). Nur der Erfolg schließt.
    await activateIncomingContact(contactRequest.fromId)
    dismiss()
  }

  const handleCounterVerify = async () => {
    if (!incomingVerification || !hasEncounterVerification(connector)) return
    await connector.counterVerify(incomingVerification.fromId)
    dismiss()
  }

  const navigate = useNavigate()
  const handleOpenSpace = () => {
    if (spaceInvite) {
      navigate(`/${spaceInvite.spaceId}/feed`)
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
      {/* Gleiche Komponente, andere Variante: Anfrage-Bestätigung statt
          Begegnungs-Verifikation. */}
      <MutualVerificationDialog
        open={!!contactConfirmed}
        variant="contact"
        peerName={contactConfirmed?.fromName}
        peerAvatar={contactConfirmed?.fromAvatar}
        myName={currentUser?.displayName}
        myAvatar={currentUser?.avatarUrl}
        onDismiss={dismiss}
      />
      <IncomingContactRequestDialog
        open={!!contactRequest}
        requestKey={currentNotification?.id}
        fromId={contactRequest?.fromId}
        fromName={contactRequest?.fromName}
        fromAvatar={contactRequest?.fromAvatar}
        onConfirm={handleConfirmContactRequest}
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
export function ProfilePanelHost({
  userId,
  currentUser,
  connector,
  contactCount,
  onSaveProfile,
  onClose,
  onAddContact,
  contactStatusFor,
  contactDirectionFor,
}: {
  userId: string | null
  currentUser: User | null | undefined
  connector: DataInterface
  contactCount?: number
  onSaveProfile: (updates: { name: string; bio: string; avatar?: string }) => Promise<void>
  onClose: () => void
  onAddContact?: (id: string) => Promise<unknown>
  contactStatusFor?: (id: string) => "pending" | "active" | undefined
  contactDirectionFor?: (id: string) => "incoming" | "outgoing" | undefined
}) {
  const isOwn = userId != null && userId === currentUser?.id
  const [foreign, setForeign] = useState<User | null>(null)

  // Own bio lives in the connector's profile item (person/v1), not in the
  // User object — without this the editor reopens with an empty bio even
  // though updateMyProfile persisted it (applies to WoT and Supabase alike).
  const [myBio, setMyBio] = useState("")
  useEffect(() => {
    if (!isOwn || !hasProfile(connector)) {
      setMyBio("")
      return
    }
    // Stale/error guard: a resolve after the effect re-ran (connector or
    // profile switch) must not apply, and a rejecting connector must not
    // surface as unhandledrejection.
    let cancelled = false
    const observable = connector.observeMyProfile()
    const apply = (item: import("@real-life-stack/data-interface").Item | null) => {
      if (cancelled) return
      setMyBio(typeof item?.data.bio === "string" ? item.data.bio : "")
    }
    apply(observable.current)
    connector.getMyProfile().then(apply).catch((error) => {
      console.error("[ProfilePanelHost] getMyProfile failed", error)
    })
    const unsubscribe = observable.subscribe(apply)
    return () => { cancelled = true; unsubscribe() }
  }, [isOwn, connector])

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
        bio: myBio,
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
  }, [userId, isOwn, currentUser, foreign, myBio])

  return (
    <AdaptivePanel
      open={userId !== null}
      onClose={onClose}
      allowedModes={["modal"]}
      modalClassName="sm:max-w-sm"
    >
      {profile && (
        // Two concrete branches so the discriminated union narrows:
        // edit carries onSave, view forbids it.
        isOwn ? (
          <ProfilePanelContent
            key={profile.did}
            mode="edit"
            profile={profile}
            contactCount={contactCount}
            onSave={onSaveProfile}
            onClose={onClose}
            profileUrl={`${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(profile.did)}`}
          />
        ) : (
          <ProfilePanelContent
            key={profile.did}
            mode="view"
            profile={profile}
            onClose={onClose}
            onAddContact={onAddContact && userId ? () => onAddContact(userId) : undefined}
            contactStatus={userId ? contactStatusFor?.(userId) : undefined}
            contactDirection={userId ? contactDirectionFor?.(userId) : undefined}
          />
        )
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
  const { activeContacts, pendingContacts, contacts: allContacts, isLoading: contactsLoading, addContact, activateContact, removeContact, updateContactName, supportsContacts } = useContacts()
  const verification = useVerification()

  // Erstbefüllung des Verify-Dialogs: restore-dann-create (Entscheidung 1c).
  // Der Dialog-Stack ist reload-fest (?dialog=verify) — nach einem Reload mit
  // offenem QR lebt die persistierte Challenge weiter, statt dass eine neue
  // die alte (vom Freund evtl. schon gescannte) still ersetzt.
  const ensureVerificationChallenge = useCallback(async () => {
    const restored = await verification.restoreChallenge()
    if (restored) return restored
    return verification.createChallenge()
  }, [verification.restoreChallenge, verification.createChallenge])

  // Dialog-Ebene (Ebene 2) als Back-Stack, an die Browser-History gekoppelt:
  // der Stack lebt im ?dialog=-Query (Komma-Liste, letztes = oben). Öffnen
  // pusht einen History-Eintrag; Schließen (X/Esc/Backdrop) und Browser-Zurück
  // poppen über die History eine Ebene. Verify aus Kontakten heraus → zurück
  // zu Kontakten; direkt geöffnet → einfach zu. Deep-linkbar + refresh-fest.
  // Spec: 01-app-composition → Overlay-Flächen, Regel 5.
  type DialogLayerId = "contacts" | "verify"
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const dialogStack = useMemo<DialogLayerId[]>(() => {
    const raw = searchParams.get("dialog")?.split(",") ?? []
    return raw.filter((x): x is DialogLayerId => x === "contacts" || x === "verify")
  }, [searchParams])
  const topDialog = dialogStack[dialogStack.length - 1] ?? null
  const openDialog = (id: DialogLayerId) => {
    const next = [...dialogStack.filter((x) => x !== id), id]
    const params = new URLSearchParams(searchParams)
    params.set("dialog", next.join(","))
    // Jeden In-App-Push als unseren markieren, damit popDialog ihn sicher
    // erkennt. Vorhandenen Route-State erhalten.
    const prev = (typeof location.state === "object" && location.state) || {}
    setSearchParams(params, { state: { ...prev, rlsDialogPush: true } })
  }
  // Schließen poppt eine Ebene. Nur In-App geöffnete Dialoge haben einen
  // echten History-Eintrag, den navigate(-1) sauber poppt (Browser-Zurück
  // identisch). Wir markieren diese Pushes mit state.rlsDialogPush.
  //
  // location.key taugt NICHT als Detektor: ein replace erzeugt einen neuen
  // Key, also wäre bei gestapeltem Deep-Link (?dialog=contacts,verify) nur
  // der erste Close "default", der zweite würde fälschlich navigate(-1)
  // rausnavigieren. state.rlsDialogPush überlebt das, weil wir es beim
  // replace-Entfernen NICHT setzen — Deep-Link/Refresh-Einträge bleiben so
  // dauerhaft "nicht-gepusht" und schließen Ebene für Ebene per replace,
  // ohne die App zu verlassen.
  const popDialog = () => {
    const pushed = (location.state as { rlsDialogPush?: boolean } | null)?.rlsDialogPush
    if (pushed) {
      navigate(-1)
    } else {
      const next = dialogStack.slice(0, -1)
      const params = new URLSearchParams(searchParams)
      if (next.length > 0) params.set("dialog", next.join(","))
      else params.delete("dialog")
      setSearchParams(params, { replace: true })
    }
  }
  // Radix-Dialoge (RemoveScroll) setzen `body { pointer-events: none }` und
  // können es nach gestapeltem Open/Close (Kontakte unter Verify) HÄNGEN
  // lassen → danach ist die ganze App unklickbar (Erstellen-Button „ohne
  // Wirkung"). Das AdaptivePanel nutzt einen eigenen Backdrop, kein body-Lock;
  // sobald also kein Dialog mehr offen ist, body sicher wieder freigeben.
  useEffect(() => {
    if (topDialog !== null) return
    const t = setTimeout(() => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }, 0)
    return () => clearTimeout(t)
  }, [topDialog])
  // The profile overlay lives in the URL (`?profile={userId}`) so it is
  // deep-linkable and back-stackable: opening pushes a history entry (joining
  // the same rlsDialogPush mechanism as the dialog stack), so browser-back / X
  // pops it. The own profile (id === currentUser.id) opens the editor, any
  // other id a read-only view.
  const profileUserId = searchParams.get("profile")
  const openProfile = useCallback((userId: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("profile", userId)
    const prev = (typeof location.state === "object" && location.state) || {}
    setSearchParams(params, { state: { ...prev, rlsDialogPush: true } })
  }, [searchParams, setSearchParams, location.state])
  const closeProfile = useCallback(() => {
    // Mirror popDialog: an in-app push has a real history entry → navigate(-1)
    // (browser-back identical); a deep-link/refresh entry isn't pushed → strip
    // the param via replace so we never navigate out of the app.
    const pushed = (location.state as { rlsDialogPush?: boolean } | null)?.rlsDialogPush
    if (pushed) {
      navigate(-1)
    } else {
      const params = new URLSearchParams(searchParams)
      params.delete("profile")
      setSearchParams(params, { replace: true })
    }
  }, [location.state, navigate, searchParams, setSearchParams])

  const handleSaveProfile = useCallback(async (updates: { name: string; bio: string; avatar?: string }) => {
    if (hasProfile(connector)) {
      await connector.updateMyProfile(updates)
    }
  }, [connector])

  const [addContactOpen, setAddContactOpen] = useState(false)

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
  const [drawerHeight, setDrawerHeight] = useState(0)
  const [activityOpen, setActivityOpen] = useState(false)
  const closeActivity = useCallback(() => setActivityOpen(false), [])
  const activity = useActivity()
  const notifications = useNotifications()
  const openNotification = useCallback((notification: import("@real-life-stack/toolkit").NotificationCandidate) => {
    navigate(buildNotificationRoute(notification, groups))
    closeActivity()
  }, [closeActivity, groups, navigate])
  // Raw-history clicks escalate the module when the active one cannot show
  // the target (lens-active-item-escalates-view) — otherwise plain focus.
  const { data: allItems } = useItems()
  const { focusItem } = useItemFocus()
  const openEntryTarget = useCallback((targetId: string) => {
    const item = allItems.find(({ id }) => id === targetId)
    const hints = item ? moduleHintsFor(item) : undefined
    if (item && activeWorkspace && !moduleCanDisplay(activeModule ?? "feed", hints, item.type)) {
      navigate(buildNotificationRoute({ groupId: activeWorkspace.id, subjectId: targetId, subjectType: item.type, moduleHints: hints } as import("@real-life-stack/toolkit").NotificationCandidate, groups))
      return
    }
    focusItem(targetId)
  }, [activeModule, activeWorkspace, allItems, focusItem, groups, navigate])
  const supportsMessaging = hasMessaging(connector)

  const toggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <OpenProfileProvider openProfile={openProfile}>
    <DraftItemProvider>
    <UnsavedChangesProvider>
    <DetailHostProvider>
    <LocationPickProvider navigateToModule={handleModuleChange} currentModule={activeModule}>
    <CreateHostProvider>
    <ModulePanelHost onDrawerHeightChange={setDrawerHeight}>
    <ActivityPanelController open={activityOpen} onClose={closeActivity} onOpenNotification={openNotification} onOpenEntryTarget={openEntryTarget} onOpenGroup={(groupId) => { const group = workspaces.find((workspace) => workspace.id === groupId); if (group) handleWorkspaceChange(group); closeActivity() }} />
    <CreateSheetController />
    <DetailHostController activeModule={activeModule} activeGroupId={activeWorkspace?.id ?? null} />
    <UnsavedChangesGuard />
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
          {supportsMessaging && <RelayStatusBadgeWrapper />}
          {notifications.supported ? <NotificationBell open={activityOpen} count={notifications.badgeCount} onOpenChange={setActivityOpen} /> : activity.supported && <ActivityBell open={activityOpen} onOpenChange={setActivityOpen} />}
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
            onContacts={supportsContacts ? () => openDialog("contacts") : undefined}
            contactCount={activeContacts.length}
            onVerify={hasEncounterVerification(connector) ? () => openDialog("verify") : undefined}
            onLogout={isAuthenticatable(connector) ? async () => {
              await connector.logout()
              window.location.reload()
            } : undefined}
          />
        </NavbarEnd>
      </Navbar>

      {/* Map is full-bleed: skip the bottom-nav padding so the map fills the
          area behind the translucent BottomNav instead of leaving a gap above
          it. Scrolling modules keep the padding so content clears the nav. */}
      <AppShellMain withBottomNav={activeModule !== "map"}>
        <ModuleOutlet
          activeWorkspace={activeWorkspace}
          activeModule={activeModule}
          groups={groups}
          urlSpaceId={urlSpaceId}
          urlItemId={urlItemId}
          selectionFocusVisibleArea={drawerHeight > 0 ? { bottomInset: drawerHeight } : undefined}
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
        onClose={closeProfile}
        onAddContact={supportsContacts ? addContact : undefined}
        contactStatusFor={(id) => allContacts.find((contact) => contact.id === id)?.status}
        contactDirectionFor={(id) => allContacts.find((contact) => contact.id === id)?.direction}
      />

      {/* Contacts Dialog */}
      <ContactsDialog
        open={topDialog === "contacts"}
        onOpenChange={(open) => { if (!open) popDialog() }}
        activeContacts={activeContacts}
        pendingContacts={pendingContacts}
        isLoading={contactsLoading}
        onRemove={removeContact}
        onEditName={updateContactName}
        onVerify={hasEncounterVerification(connector) ? () => openDialog("verify") : undefined}
        onAdd={supportsContacts && !hasEncounterVerification(connector) ? () => setAddContactOpen(true) : undefined}
        onActivate={activateContact}
        activeLabel={hasEncounterVerification(connector) ? "Verifiziert" : "Aktiv"}
      />

      {/* Kontakt per ID/Profil-Link hinzufügen (Anfrage-Connectoren). */}
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onAdd={(id, name) => addContact(extractProfileId(id), name)}
      />

      <VerificationDialog
        open={topDialog === "verify" && hasEncounterVerification(connector)}
        onOpenChange={(open) => { if (!open) popDialog() }}
        challenge={verification.challenge}
        peerInfo={verification.peerInfo}
        isProcessing={verification.isProcessing}
        error={verification.error}
        onCreateChallenge={verification.createChallenge}
        onEnsureChallenge={ensureVerificationChallenge}
        onScanChallenge={verification.scanChallenge}
        onConfirmVerification={verification.confirmVerification}
        onReset={verification.reset}
      />

      {/* Incoming event dialogs */}
      <IncomingEventDialogs onCloseVerifyDialog={() => { if (topDialog === "verify") popDialog() }} />

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
    </ModulePanelHost>
    </CreateHostProvider>
    </LocationPickProvider>
    </DetailHostProvider>
    </UnsavedChangesProvider>
    </DraftItemProvider>
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
    // 0.3.0: vaultUrl entfernt (Connector nutzt kein Vault); Defaults auf die
    // aktiven web-of-trust.de-Dienste (utopia-lab-Legacy ist abgeschaltet).
    const connector = new WotConnector({
      relayUrl: import.meta.env.VITE_RELAY_URL ?? "wss://relay.web-of-trust.de",
      profilesUrl: import.meta.env.VITE_PROFILE_SERVICE_URL ?? "https://profiles.web-of-trust.de",
    })
    await connector.init()
    return connector
  }
  if (type === "local") {
    const c = new LocalConnector(demoData)
    await c.init()
    return c
  }
  if (type === "supabase") {
    const { createSupabaseConnector } = await import("@real-life-stack/supabase-connector")
    const connector = createSupabaseConnector(
      import.meta.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
      import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    )
    await connector.init()
    // No auto-login: the AuthGate presents the generic AuthScreen (email
    // login/signup + anonymous). supabase-js persists sessions, so an
    // existing login survives reloads and skips the gate.
    return connector
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

/** Methods the generic AuthScreen can actually present. */
const GENERIC_AUTH_METHODS = new Set(["email", "email-signup", "anonymous"])

export function AuthGate({ connector, wot, children }: { connector: DataInterface; wot: boolean; children: React.ReactNode }) {
  // WoT: check auth state once at mount and LATCH — the DIDAuthScreen controls
  // when onAuthenticated fires (after seed backup etc.), so reacting to auth
  // state changes would skip the onboarding wizard.
  const [authenticated, setAuthenticated] = useState(() => {
    if (!isAuthenticatable(connector)) return true
    return connector.getAuthState().current.status === "authenticated"
  })

  // Generic backend path: the gate FOLLOWS the auth observable (spec
  // architektur2 → AuthState als Observable). A later session loss — expiry,
  // refresh failure, logout in another tab — must close the app again, and an
  // external login must open it.
  useEffect(() => {
    if (wot || !isAuthenticatable(connector)) return
    const observable = connector.getAuthState()
    setAuthenticated(observable.current.status === "authenticated")
    return observable.subscribe((state) => setAuthenticated(state.status === "authenticated"))
  }, [connector, wot])

  if (authenticated) {
    return <>{children}</>
  }

  if (!wot) {
    // Generic capability path (e.g. Supabase): email login/signup + anonymous.
    // A connector that offers none of these has no interactive flow — pass
    // through instead of dead-ending (matches the pre-gate behaviour of the
    // auto-authenticating demo connectors).
    if (isAuthenticatable(connector) && connector.getAuthMethods().some(({ method }) => GENERIC_AUTH_METHODS.has(method))) {
      return <AuthScreen connector={connector} onAuthenticated={() => setAuthenticated(true)} />
    }
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
        <AuthGate connector={connector} wot={connectorId === "wot"}>
          {/* Focus lives above the routes so it survives module switches — the
              shared panel's onClose must clear the focus on whatever module the
              user is on now, not the one that opened it. */}
          <ItemFocusProvider>
            <Routes>
              {/* Flat scheme — the URL is the single source of truth for the focused
                  item. `:seg` is a module (known enum) or a module-less item id;
                  use-workspace-routing discriminates + redirects. `/` and unknown
                  paths fall to `*` → Home → redirect to the default scope/module.
                  App-level surfaces (profile, contacts, …) are query overlays, not
                  path routes. Reserved for later: literal `/u/:userId`, `/join/:token`
                  would go ABOVE `:scope` (literal beats param). */}
              <Route path=":scope/:seg/:itemId" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
              <Route path=":scope/:seg" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
              <Route path=":scope" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
              <Route path="*" element={<Home activeConnectorId={connectorId} onConnectorChange={setConnectorId} />} />
            </Routes>
          </ItemFocusProvider>
        </AuthGate>
      </IncomingEventsProvider>
    </ConnectorProvider>
  )
}
