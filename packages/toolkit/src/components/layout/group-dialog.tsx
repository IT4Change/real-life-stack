import { useState, useCallback, useRef } from "react"
import { LogOut, UserMinus, UserPlus, Check, Loader2, ImagePlus, X, Camera, Pencil, Newspaper, Columns3, Calendar, MapIcon } from "lucide-react"
import type { Group, ContactInfo } from "@real-life-stack/data-interface"
import { useMembers } from "../../hooks/use-groups"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "../primitives/dialog"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import { Label } from "../primitives/label"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { Skeleton } from "../primitives/skeleton"

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const AVAILABLE_MODULES = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "calendar", label: "Kalender", icon: Calendar },
  { id: "map", label: "Karte", icon: MapIcon },
] as const

const DEFAULT_MODULES = ["feed", "kanban", "calendar", "map"]

/** Human-readable fallback for raw IDs (e.g. DIDs) */
function shortName(id: string): string {
  return `User-${id.slice(-6)}`
}

// --- Types ---

export type GroupDialogMode =
  | { type: "create" }
  | { type: "edit"; group: Group }

export interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: GroupDialogMode
  contacts?: ContactInfo[]
  /** Current user's ID (DID) — used to determine creator status */
  currentUserId?: string
  onCreateGroup: (name: string) => Promise<void>
  onUpdateGroup: (id: string, updates: Partial<Group>) => Promise<void>
  onDeleteGroup: (id: string) => Promise<void>
  onInviteMember?: (groupId: string, userId: string) => Promise<void>
  onRemoveMember?: (groupId: string, userId: string) => Promise<void>
}

// --- Component ---

export function GroupDialog({
  open,
  onOpenChange,
  mode,
  contacts,
  currentUserId,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onInviteMember,
  onRemoveMember,
}: GroupDialogProps) {
  const isEdit = mode.type === "edit"
  const groupId = isEdit ? mode.group.id : "__none__"
  const { data: members, isLoading: membersLoading } = useMembers(groupId)
  // Admin-gated controls follow the authoritative admin set (member.isAdmin,
  // derived from space.admins/createdBy), NOT list position: space.members is
  // DID-sorted, so members[0] is an arbitrary member, not the creator.
  const isCurrentUserAdmin =
    isEdit && members.some((m) => m.id === currentUserId && m.isAdmin)

  const [name, setName] = useState(() =>
    isEdit ? mode.group.name : ""
  )
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupImage, setGroupImage] = useState(() =>
    isEdit ? (mode.group.data?.image as string | undefined) ?? "" : ""
  )

  // Module state
  const [activeModules, setActiveModules] = useState<string[]>(() =>
    isEdit ? (mode.group.data?.modules as string[] | undefined) ?? DEFAULT_MODULES : DEFAULT_MODULES
  )

  // Invite state
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [inviteErrors, setInviteErrors] = useState<Map<string, string>>(new Map())

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setConfirmDelete(false)
        setError(null)
        setInvitingId(null)
        setInvitedIds(new Set())
        setInviteErrors(new Map())
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onCreateGroup(name.trim())
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Erstellen")
    } finally {
      setSaving(false)
    }
  }

  const handleNameBlur = () => {
    if (!isEdit || !name.trim() || name.trim() === mode.group.name) return
    setError(null)
    onUpdateGroup(mode.group.id, { name: name.trim() }).catch((err) => {
      setError(err instanceof Error ? err.message : "Fehler beim Umbenennen")
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !isEdit) return
    if (!file.type.startsWith("image/")) return
    try {
      const { resizeImage, dominantColor } = await import("../../lib/image-utils")
      const dataUrl = await resizeImage(file, 200, 0.8)
      setGroupImage(dataUrl)
      // Cache the logo's dominant color as the space accent (once, here). On a
      // grayscale logo dominantColor returns null -> clear it so reads fall
      // back to the deterministic id color.
      const primaryColor = await dominantColor(dataUrl).catch(() => null)
      void onUpdateGroup(mode.group.id, {
        data: { ...mode.group.data, image: dataUrl, primaryColor: primaryColor ?? undefined },
      })
    } catch {
      setError("Bild konnte nicht verarbeitet werden")
    }
    e.target.value = ""
  }

  const handleImageRemove = () => {
    if (!isEdit) return
    setGroupImage("")
    // Drop the cached accent too, so it falls back to the deterministic id color.
    void onUpdateGroup(mode.group.id, { data: { ...mode.group.data, image: "", primaryColor: undefined } })
  }

  const handleLeave = async () => {
    if (!isEdit) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onDeleteGroup(mode.group.id)
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Verlassen")
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const handleInviteContact = async (contactId: string) => {
    if (!isEdit || !onInviteMember) return
    setInvitingId(contactId)
    setInviteErrors((prev) => { const m = new Map(prev); m.delete(contactId); return m })
    try {
      await onInviteMember(mode.group.id, contactId)
      setInvitedIds((prev) => new Set([...prev, contactId]))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Einladung fehlgeschlagen"
      setInviteErrors((prev) => new Map([...prev, [contactId, msg]]))
    } finally {
      setInvitingId(null)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!isEdit || !onRemoveMember) return
    setError(null)
    try {
      await onRemoveMember(mode.group.id, userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Entfernen")
    }
  }

  const memberIds = new Set(members.map((m) => m.id))
  const invitableContacts = (contacts ?? []).filter(
    (c) => c.status === "active" && !memberIds.has(c.id) && !invitedIds.has(c.id)
  )
  const justInvitedContacts = (contacts ?? []).filter(
    (c) => invitedIds.has(c.id) && !memberIds.has(c.id)
  )

  // --- Create Mode ---
  if (!isEdit) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
          <div className="px-6 pt-7 pb-5">
            <DialogTitle className="text-lg font-semibold">Neue Gruppe</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Erstelle eine neue Gruppe fuer dein Team.</p>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="group-name" className="text-xs text-muted-foreground">Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Nachbarschaft, Projekt-Team..."
                autoFocus
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCreate()
                  }
                }}
              />
            </div>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/20">
            <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? "Erstellen..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // --- Edit Mode ---
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{isEdit ? mode.group.name : "Neue Gruppe"}</DialogTitle>
        {/* Group Identity Header */}
        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-start gap-4">
            {/* Group Image */}
            <div className="relative group shrink-0">
              {groupImage ? (
                <>
                  <img src={groupImage} alt={name} className="w-14 h-14 rounded-xl object-cover ring-2 ring-background shadow-sm" />
                  <button
                    onClick={handleImageRemove}
                    className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <label className="absolute -bottom-0.5 -right-0.5 p-1 bg-card border border-border rounded-full shadow-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent">
                    <Camera className="h-2.5 w-2.5 text-muted-foreground" />
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </>
              ) : (
                <label className="w-14 h-14 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex items-center justify-center cursor-pointer transition-all hover:bg-muted/50">
                  <ImagePlus className="h-5 w-5 text-muted-foreground/40" />
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Name Input */}
            <div className="flex-1 min-w-0 pt-1 group/name">
              <div className="relative">
                <Input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleNameBlur}
                  className="h-8 text-base font-semibold border-transparent shadow-none bg-transparent -ml-1.5 px-1 min-w-32 max-w-[calc(100%-2rem)] hover:bg-muted/50 focus:shadow-sm focus:bg-card focus:border-input focus:ml-0 focus:px-2 focus:max-w-[calc(100%-2rem)] transition-all truncate"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleNameBlur()
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => nameInputRef.current?.focus()}
                  className="absolute top-1/2 -translate-y-1/2 group-focus-within/name:hidden text-muted-foreground/30 group-hover/name:text-muted-foreground/60 transition-colors"
                  style={{ left: `${Math.min(name.length + 1, 20)}ch` }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {membersLoading ? "Mitglieder werden geladen…" : `${members.length} Mitglieder`}
              </p>
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="px-6 pb-2">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {membersLoading &&
              members.length === 0 &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`member-skeleton-${i}`} className="flex items-center gap-2.5 px-2 py-1.5" aria-hidden>
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            {members.map((member) => (
              <div
                key={member.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-7 w-7">
                  {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(member.displayName ?? shortName(member.id))}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">
                  {member.displayName ?? shortName(member.id)}
                </span>
                {member.isAdmin && (
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">Admin</span>
                )}
                {isCurrentUserAdmin && onRemoveMember && member.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveMember(member.id)}
                    title="Mitglied entfernen"
                    className="h-6 w-6 opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}

            {/* Just invited feedback */}
            {justInvitedContacts.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-green-500/5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px] bg-green-500/10 text-green-700">
                    {getInitials(c.name ?? shortName(c.id))}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{c.name ?? shortName(c.id)}</span>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </div>
            ))}
          </div>

          {/* Invite Section */}
          {onInviteMember && invitableContacts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <Label className="text-xs text-muted-foreground">Kontakt einladen</Label>
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {invitableContacts.map((contact) => {
                  const isInviting = invitingId === contact.id
                  const inviteError = inviteErrors.get(contact.id)
                  return (
                    <div key={contact.id}>
                      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                        <Avatar className="h-7 w-7">
                          {contact.avatar && <AvatarImage src={contact.avatar} />}
                          <AvatarFallback className="text-[10px]">
                            {getInitials(contact.name ?? contact.id)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate text-sm">{contact.name ?? shortName(contact.id)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleInviteContact(contact.id)}
                          disabled={isInviting || invitingId !== null}
                        >
                          {isInviting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserPlus className="h-3 w-3" />
                          )}
                          <span className="ml-1">Einladen</span>
                        </Button>
                      </div>
                      {inviteError && (
                        <p className="text-xs text-destructive ml-11 -mt-0.5 mb-1">{inviteError}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* No contacts hint */}
          {onInviteMember && invitableContacts.length === 0 && justInvitedContacts.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
              {(contacts ?? []).some((c) => c.status === "active")
                ? "Alle Kontakte sind bereits Mitglied."
                : "Keine verifizierten Kontakte."}
            </p>
          )}

          {/* Module Toggles (admin only) */}
          {isCurrentUserAdmin && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <Label className="text-xs text-muted-foreground">Module</Label>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {AVAILABLE_MODULES.map((mod) => {
                  const isActive = activeModules.includes(mod.id)
                  const isLast = isActive && activeModules.length === 1
                  const Icon = mod.icon
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      disabled={isLast}
                      onClick={() => {
                        if (mode.type !== "edit") return
                        const newModules = isActive
                          ? activeModules.filter((m) => m !== mod.id)
                          : [...activeModules, mod.id]
                        setActiveModules(newModules)
                        void onUpdateGroup(mode.group.id, { data: { ...mode.group.data, modules: newModules } })
                      }}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className={`h-4 w-8 shrink-0 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-muted"} relative`}>
                        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{mod.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive px-6 pb-2">{error}</p>
        )}

        {/* Footer */}
        <DialogFooter className="flex-row! px-6 py-3 border-t bg-muted/20">
          <Button
            variant={confirmDelete ? "destructive" : "ghost"}
            size="sm"
            onClick={handleLeave}
            disabled={saving}
            className="mr-auto"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            {confirmDelete ? "Wirklich verlassen?" : "Verlassen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
