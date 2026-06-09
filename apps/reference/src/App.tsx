import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from "react"
import { Routes, Route, useParams, useNavigate } from "react-router-dom"
import {
  Newspaper,
  Map as MapIcon,
  Calendar,
  Plus,
  Sun,
  Moon,
  Columns3,
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
  ContentComposer,
  type ContentComposerSubmitData,
  type ContentTypeConfig,
  AdaptivePanel,
  CalendarView,
  Button,
  GroupDialog,
  ProfileDialog,
  ContactsDialog,
  VerificationDialog,
  IncomingVerificationDialog,
  IncomingSpaceInviteDialog,
  MutualVerificationDialog,
  RelayStatusBadge,
  IncomingEventsProvider,
  useIncomingEvents,
  ConnectorProvider,
  useItems,
  useMembers,
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useInviteMember,
  useRemoveMember,
  useCurrentUser,
  useCreateItem,
  useConnector,
  useContacts,
  useVerification,
  useRelayStatus,
  ItemDetailPanel,
  ReactionBar,
  FeedItem,
  FeedComposerTrigger,
  type MapMarkerSpec,
  type Workspace,
  type UserData,
  type Module,
  type ConnectorOption,
  type GroupDialogMode,
} from "@real-life-stack/toolkit"
import type { Item, DataInterface } from "@real-life-stack/data-interface"
import { hasGroups, isAuthenticatable, hasMessaging, hasEncounterVerification, hasProfile } from "@real-life-stack/data-interface"
import { LeafletMapAdapter } from "@real-life-stack/toolkit/leaflet"
import { demoItems, demoGroups, demoUsers, demoGroupMembers, demoGroupItems } from "@real-life-stack/data-interface/demo-data"
import { MockConnector } from "@real-life-stack/mock-connector"
import { LocalConnector } from "@real-life-stack/local-connector"
import { KanbanView } from "./views/kanban-view"

const MODULE_ICONS: Record<string, typeof Newspaper> = {
  feed: Newspaper,
  map: MapIcon,
  calendar: Calendar,
  kanban: Columns3,
}

const MODULE_LABELS: Record<string, string> = {
  feed: "Feed",
  map: "Karte",
  calendar: "Kalender",
  kanban: "Kanban",
}

const CONNECTOR_OPTIONS: ConnectorOption[] = [
  { id: "mock", name: "Mock", description: "In-Memory, kein Speichern" },
  { id: "local", name: "Local", description: "IndexedDB, persistent" },
  { id: "wot", name: "Web of Trust", description: "E2E-verschlüsselt, Multi-Device" },
]

function FeedView({ groupId }: { groupId: string }) {
  // Spec 06 §"Verhältnis zwischen Schema- und Feldfiltern": modules activate
  // items by field presence, not the legacy `type` UI hint.
  // - Posts carry data.content (base/v1)
  // - Events carry data.start (event/v1)
  // Cross-context items (e.g. an event-with-place) naturally show up in
  // multiple modules without any extra handling.
  const { data: posts } = useItems({ hasField: ["content"] })
  const { data: events } = useItems({ hasField: ["start"] })
  const { data: members } = useMembers(groupId)
  const { mutate: createItem } = useCreateItem()
  const { data: currentUser } = useCurrentUser()

  // Merge posts + events, dedupe, sort newest first.
  // Dedupe is load-bearing: with hasField filters, a single item can
  // satisfy both queries (a post that also carries data.start, an event
  // with data.content, …) and would otherwise render twice.
  //
  // Comment items also carry `data.content` (use-comments writes them
  // as `type: "comment"` with `data.content`). Without an exclusion
  // they'd surface in the feed as if they were posts. Use the `type`
  // UI-hint as a discriminator — spec 06 keeps `type` valid for that
  // role even when activation runs on field presence. A future
  // comment/v1 vocab + hasSchema would make this redundant.
  const feedItems = useMemo(() => {
    const merged = [...posts, ...events].filter((it) => it.type !== "comment")
    const unique = Array.from(new Map(merged.map((it) => [it.id, it])).values())
    return unique.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [posts, events])

  // Resolve author info
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  )

  const resolveAuthor = useCallback((createdBy: string) => {
    const member = memberMap.get(createdBy)
    if (member) return { name: member.displayName ?? member.id, avatar: member.avatarUrl }
    if (currentUser && createdBy === currentUser.id) return { name: currentUser.displayName ?? currentUser.id, avatar: currentUser.avatarUrl }
    return { name: createdBy }
  }, [memberMap, currentUser])

  // Detail panel state
  const [detailItem, setDetailItem] = useState<Item | null>(null)

  // Content type configs for the composer
  const feedContentTypes: ContentTypeConfig[] = useMemo(() => [
    {
      id: "post",
      label: "Post",
      defaultWidgets: ["text"],
      submitLabel: "Posten",
    },
    {
      id: "event",
      label: "Veranstaltung",
      defaultWidgets: ["title", "text", "date", "location"],
      submitLabel: "Erstellen",
    },
  ], [])

  const handleCreate = useCallback(async (submission: ContentComposerSubmitData) => {
    // ContentComposer surfaces the free-text field as `text`; spec base/v1
    // uses `content` for posts and `description` for items that already
    // carry a structured payload (events here). Without this mapping a
    // composer-created post lands in `data.text`, which FeedItem doesn't
    // render and `hasField: ["content"]` doesn't match.
    //
    // We also strip empty defaults from the composer state (it initializes
    // status/group/title/text/media/people/tags to "" or []). Without this
    // a post would ship with `data.status = ""` and match the Kanban
    // filter `hasField: ["status"]`, leaking it onto the board.
    const { text, ...rest } = submission.data
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => {
        if (v === "" || v === null || v === undefined) return false
        if (Array.isArray(v) && v.length === 0) return false
        return true
      }),
    )
    const itemData = submission.contentType === "post"
      ? { ...cleaned, ...(text ? { content: text } : {}) }
      : { ...cleaned, ...(text ? { description: text } : {}) }
    await createItem({
      type: submission.contentType,
      createdBy: currentUser?.id ?? "anonymous",
      data: itemData,
    })
  }, [createItem, currentUser?.id])

  return (
    <div className="space-y-4">
      {/* Composer trigger — morphs into fullscreen modal */}
      <FeedComposerTrigger
        placeholder="Was gibt's Neues?"
        userName={currentUser?.displayName}
        userAvatar={currentUser?.avatarUrl}
      >
        {({ onClose, initialText }) => (
          <div className="flex flex-col h-full">
            <ContentComposer
              className="p-4 sm:p-6 flex-1"
              contentTypes={feedContentTypes}
              initialData={initialText ? { text: initialText } : undefined}
              onSubmit={(data) => { handleCreate(data); onClose() }}
              onCancel={onClose}
              showPreview={false}
            />
          </div>
        )}
      </FeedComposerTrigger>

      {/* Feed items */}
      <div className="space-y-4">
        {feedItems.map((item) => (
          <FeedItem
            key={item.id}
            item={item}
            author={resolveAuthor(item.createdBy)}
            onClick={() => setDetailItem(item)}
            reactionSlot={item.type !== "task" ? <ReactionBar itemId={item.id} /> : undefined}
            commentCount={(item.data as Record<string, unknown>).commentCount as number | undefined}
            onCommentClick={() => setDetailItem(item)}
          />
        ))}
      </div>

      {/* Detail panel */}
      <AdaptivePanel
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        allowedModes={["sidebar", "drawer"]}
        sidebarWidth="420px"
      >
        {detailItem && (
          <ItemDetailPanel
            itemId={detailItem.id}
            renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
          >
            <div className="p-4">
              <FeedItem
                item={detailItem}
                author={resolveAuthor(detailItem.createdBy)}
                reactionSlot={detailItem.type !== "task" ? <ReactionBar itemId={detailItem.id} /> : undefined}
              />
            </div>
          </ItemDetailPanel>
        )}
      </AdaptivePanel>
    </div>
  )
}

/**
 * Map module — first real version using the LeafletMapAdapter from toolkit.
 *
 * Shows every item in the current space that has `data.position` (GeoJSON
 * Point). This is the cross-module case: a workshop with `type=event` and a
 * `position` appears on both the calendar and the map.
 */
function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Adapter lives in state so the markers-effect re-runs once `mount()` has
  // actually resolved. With lazy-loaded leaflet, `mount()` is genuinely async,
  // and the StrictMode double-mount race is too tight for refs alone.
  const [adapter, setAdapter] = useState<LeafletMapAdapter | null>(null)
  // Field-presence filter (spec 06): any item with data.position is
  // map-renderable, regardless of `type`. The Point/coordinates check
  // below is still defensive validation, not the activation criterion.
  const { data: items } = useItems({ hasField: ["position"] })

  const markers: MapMarkerSpec[] = useMemo(() => {
    const list: MapMarkerSpec[] = []
    for (const item of items) {
      const pos = item.data.position as { type?: string; coordinates?: number[] } | undefined
      if (!pos || pos.type !== "Point" || !Array.isArray(pos.coordinates) || pos.coordinates.length < 2) continue
      const [lng, lat] = pos.coordinates
      if (typeof lng !== "number" || typeof lat !== "number") continue
      list.push({
        id: item.id,
        position: [lng, lat],
        label: typeof item.data.title === "string" ? item.data.title : item.id,
      })
    }
    return list
  }, [items])

  // Mount the adapter once. Lazy-loaded leaflet means mount() is properly
  // async, which exposes a classic StrictMode race: both effect passes start
  // their own mount() in parallel and would race for the same DOM container,
  // ending in Leaflet's "Map container is already initialized" error.
  //
  // Robust fix: each effect run gets its own fresh inner div as Leaflet's
  // container, appended to the stable outer ref. On cleanup we tear down the
  // adapter and remove the inner div, so the second pass gets a pristine
  // container that no previous mount can have claimed.
  useEffect(() => {
    if (!containerRef.current) return
    const inner = document.createElement("div")
    inner.style.height = "100%"
    inner.style.width = "100%"
    containerRef.current.appendChild(inner)

    let cancelled = false
    let mounted = false
    const ad = new LeafletMapAdapter()
    ad.mount(inner, {
      center: [13.4, 52.5], // Berlin-ish default; replace with space config later
      zoom: 6,
    }).then(
      () => {
        if (cancelled) {
          ad.unmount().catch(() => {})
        } else {
          mounted = true
          setAdapter(ad)
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("LeafletMapAdapter mount failed", err)
      },
    )
    return () => {
      cancelled = true
      if (mounted) {
        ad.unmount().catch(() => {})
        setAdapter((current) => (current === ad ? null : current))
      }
      inner.remove()
    }
  }, [])

  // Push markers to the adapter once it is mounted, and on every change.
  useEffect(() => {
    adapter?.setMarkers(markers)
  }, [adapter, markers])

  // `isolate` creates a new stacking context so Leaflet's internal z-indices
  // (zoom controls up to 1000, popup panes 700, marker panes 600) stay contained
  // and don't overlay the navbar / workspace switcher / user menu above.
  return <div ref={containerRef} className="h-full w-full isolate" />
}

function CalendarViewWrapper() {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })

  return (
    <CalendarView
      events={events}
      onEventClick={(event) => console.log("Event clicked:", event.id)}
    />
  )
}

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

function Home({ activeConnectorId, onConnectorChange }: { activeConnectorId: string; onConnectorChange: (id: string) => void }) {
  const connector = useConnector()
  const navigate = useNavigate()
  const { spaceId: urlSpaceId, module: urlModule, itemId: urlItemId } = useParams<{ spaceId?: string; module?: string; itemId?: string }>()
  const { data: groups } = useGroups()
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
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const profileData = useMemo(() => ({
    did: currentUser?.id ?? "",
    name: currentUser?.displayName ?? "",
    bio: "",
    avatar: currentUser?.avatarUrl,
  }), [currentUser])

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

  const basePath = import.meta.env.BASE_URL
  const OVERVIEW_WORKSPACE: Workspace = { id: "__overview__", name: "Mein Netzwerk", scope: "overview" }
  const workspaces: Workspace[] = useMemo(
    () => [
      OVERVIEW_WORKSPACE,
      ...groups.map((g) => ({
        id: g.id,
        name: g.name,
        avatar: g.data?.image as string | undefined ?? (g.data?.avatar ? `${basePath}${g.data.avatar}` : undefined),
        scope: g.data?.scope as string | undefined,
      })),
    ],
    [groups, basePath]
  )

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

  // Derive active workspace from URL params (with fallback to localStorage → first space)
  const activeWorkspace: Workspace | null = useMemo(() => {
    if (urlSpaceId) {
      const found = workspaces.find((w) => w.id === urlSpaceId)
      if (found) return found
      // Space ID from URL but not found in list — might still be loading
      if (workspaces.length === 0) return { id: urlSpaceId, name: "" }
      // Unknown space ID (e.g. from a different connector) — fall back to first workspace
    }
    // No space in URL or unknown ID — try localStorage, then first workspace
    const savedId = localStorage.getItem(STORAGE_KEY_GROUP)
    if (savedId) {
      const found = workspaces.find((w) => w.id === savedId)
      if (found) return found
    }
    return workspaces[0] ?? null
  }, [urlSpaceId, workspaces])

  // Derive active module from URL params
  const VALID_MODULES = ["feed", "kanban", "calendar", "map"]
  const activeModule = urlModule && VALID_MODULES.includes(urlModule) ? urlModule : (localStorage.getItem(STORAGE_KEY_MODULE) ?? "feed")

  // Redirect to URL with space/module if not already there
  useEffect(() => {
    if (workspaces.length === 0) return
    if (!urlSpaceId && activeWorkspace) {
      navigate(`/spaces/${activeWorkspace.id}/${activeModule}`, { replace: true })
    }
  }, [workspaces.length, urlSpaceId, activeWorkspace, activeModule, navigate])

  // Sync connector current group when workspace changes
  useEffect(() => {
    if (activeWorkspace && hasGroups(connector)) {
      connector.setCurrentGroup(activeWorkspace.scope === "overview" ? null : activeWorkspace.id)
    }
  }, [activeWorkspace?.id, connector])

  // Save to localStorage for next session
  useEffect(() => {
    if (activeWorkspace) localStorage.setItem(STORAGE_KEY_GROUP, activeWorkspace.id)
    if (urlModule && VALID_MODULES.includes(urlModule)) localStorage.setItem(STORAGE_KEY_MODULE, urlModule)
  }, [activeWorkspace?.id, urlModule])

  // Derive available modules from active group's data.modules (overview = all modules)
  const isOverview = activeWorkspace?.scope === "overview"
  const activeGroup = isOverview ? null : groups.find((g) => g.id === activeWorkspace?.id)
  const groupModuleIds = isOverview
    ? ["feed", "kanban", "calendar", "map"]
    : (activeGroup?.data?.modules as string[] | undefined) ?? ["feed", "kanban", "calendar", "map"]
  const supportsMessaging = hasMessaging(connector)
  const [debugOpen, setDebugOpen] = useState(false)
  const modules: Module[] = useMemo(
    () => groupModuleIds
      .filter((id) => MODULE_ICONS[id])
      .map((id) => ({ id, label: MODULE_LABELS[id] ?? id, icon: MODULE_ICONS[id] })),
    [groupModuleIds.join(",")]
  )

  // When switching workspace, navigate to URL
  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    const group = groups.find((g) => g.id === workspace.id)
    const mods = (group?.data?.modules as string[] | undefined) ?? ["feed", "kanban", "calendar", "map"]
    const mod = mods.includes(activeModule) ? activeModule : (mods[0] ?? "feed")
    navigate(`/spaces/${workspace.id}/${mod}`)
  }, [groups, activeModule, navigate])

  const handleModuleChange = (moduleId: string) => {
    if (activeWorkspace) {
      navigate(`/spaces/${activeWorkspace.id}/${moduleId}`)
    }
  }

  const toggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <AppShell>
      <Navbar>
        <NavbarStart>
          {activeWorkspace ? (
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
            onProfile={() => setProfileDialogOpen(true)}
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
        {urlSpaceId && !activeWorkspace && workspaces.length > 0 ? (
          <div className="container mx-auto px-4 pt-12 max-w-md text-center">
            <p className="text-lg font-medium text-foreground">Du bist kein Mitglied dieses Spaces</p>
            <p className="text-sm text-muted-foreground mt-2">Der Space existiert nicht oder du hast keinen Zugang.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Zurück zur Übersicht</Button>
          </div>
        ) : activeModule === "map" ? (
          // Map fills the entire Space — no container, no padding, no width cap
          <MapView />
        ) : (
          <div className={`container mx-auto px-4 pt-6 ${activeModule === "kanban" ? "max-w-5xl" : "max-w-3xl"}`}>
            {activeModule === "feed" && <FeedView groupId={activeWorkspace?.id ?? ""} />}
            {activeModule === "kanban" && <KanbanView activeWorkspaceId={activeWorkspace?.id ?? null} groups={groups} selectedItemId={urlItemId} onItemSelect={(id) => navigate(`/spaces/${activeWorkspace?.id}/${activeModule}/item/${id}`)} onItemClose={() => navigate(`/spaces/${activeWorkspace?.id}/${activeModule}`)} />}
            {activeModule === "calendar" && <CalendarViewWrapper />}
          </div>
        )}
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
      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        profile={profileData}
        contactCount={activeContacts.length}
        onSave={handleSaveProfile}
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
const STORAGE_KEY_GROUP = "rls-active-group"
const STORAGE_KEY_MODULE = "rls-active-module"
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
