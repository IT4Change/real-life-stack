import { useState, useEffect, useRef } from "react"
import { Copy, Check, ImagePlus, X, Camera, Pencil } from "lucide-react"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import { Avatar, AvatarImage, AvatarFallback } from "../primitives/avatar"
import { resolveAssetUrl } from "../../lib/utils"
import { Label } from "../primitives/label"

export interface ProfileData {
  did: string
  name: string
  bio?: string
  avatar?: string
}

type ProfileSaveHandler = (updates: { name: string; bio: string; avatar?: string }) => Promise<void>

/**
 * `edit` renders the own-profile form (avatar upload, name/bio inputs,
 * Save) and requires `onSave`. `view` renders a read-only projection for
 * someone else's profile. The App Shell picks the mode by comparing the
 * clicked userId against the current user.
 */
export type ProfilePanelContentProps =
  | {
      mode: "edit"
      profile: ProfileData
      contactCount?: number
      onSave: ProfileSaveHandler
      onClose: () => void
      /** Teilbarer Link zum eigenen Profil (?profile=<id>) — zeigt den
          "Profil-Link kopieren"-Button. */
      profileUrl?: string
      onAddContact?: never
      contactStatus?: never
      contactDirection?: never
    }
  | {
      mode: "view"
      profile: ProfileData
      contactCount?: number
      onSave?: never
      onClose: () => void
      profileUrl?: never
      /** Kontaktanfrage senden (Anfrage-Connectoren). Button erscheint nur,
          wenn gesetzt und noch kein aktiver Kontakt besteht. */
      onAddContact?: () => Promise<unknown> | void
      /** Bestehender Kontaktstatus zur Button-Beschriftung. */
      contactStatus?: "pending" | "active"
      /** Richtung einer offenen Anfrage: bei "incoming" bestätigt der Button
          (die Gegenseite hat angefragt), bei "outgoing" wartet er. */
      contactDirection?: "incoming" | "outgoing"
    }

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Inner content of the profile panel — rendered inside the App Shell's
 * shared `AdaptivePanel` (modal / sidebar / drawer), not its own dialog.
 * Both the own-profile editor and read-only foreign profiles share this
 * one surface so they look and behave the same.
 */
export function ProfilePanelContent({
  mode,
  profile,
  contactCount,
  onSave,
  onClose,
  profileUrl,
  onAddContact,
  contactStatus,
  contactDirection,
}: ProfilePanelContentProps) {
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio ?? "")
  const [avatar, setAvatar] = useState(profile.avatar ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(profile.name)
    setBio(profile.bio ?? "")
    setAvatar(profile.avatar ?? "")
  }, [profile.name, profile.bio, profile.avatar])

  const isEdit = mode === "edit"

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) return
    try {
      const { resizeImage } = await import("../../lib/image-utils")
      const base64 = await resizeImage(file, 200, 0.8)
      setAvatar(base64)
    } catch {
      setError("Bild konnte nicht verarbeitet werden")
    }
    e.target.value = ""
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), bio: bio.trim(), avatar })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

  const handleCopyDid = async () => {
    await navigator.clipboard.writeText(profile.did)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shortDid = profile.did.length > 24
    ? `${profile.did.slice(0, 16)}...${profile.did.slice(-8)}`
    : profile.did

  return (
    <div className="flex h-full flex-col">
      {/* Identity header — leave room (pr-12) for the AdaptivePanel's
          close / mode-switch controls in the top-right. */}
      <div className="relative px-6 pt-6 pb-5 pr-12">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative group shrink-0">
            {isEdit ? (
              <>
                {avatar ? (
                  <>
                    <img src={resolveAssetUrl(avatar)} alt={name} className="w-14 h-14 rounded-full object-cover ring-2 ring-background shadow-sm" />
                    <button
                      type="button"
                      aria-label="Profilbild entfernen"
                      onClick={() => setAvatar("")}
                      className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Profilbild ändern"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-0.5 -right-0.5 p-1 bg-card border border-border rounded-full shadow-sm cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-accent"
                    >
                      <Camera className="h-2.5 w-2.5 text-muted-foreground" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label="Profilbild hochladen"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-full border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex items-center justify-center cursor-pointer transition-all hover:bg-muted/50"
                  >
                    <ImagePlus className="h-5 w-5 text-muted-foreground/40" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </>
            ) : (
              <Avatar className="w-14 h-14 ring-2 ring-background shadow-sm">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="text-lg">{getInitials(name)}</AvatarFallback>
              </Avatar>
            )}
          </div>

          {/* Name + Meta */}
          <div className="flex-1 min-w-0 -mt-1 group/name">
            {isEdit ? (
              <div className="relative">
                <Input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dein Name"
                  className="h-7 text-base font-semibold border-transparent shadow-none bg-transparent -ml-1.5 px-1 min-w-32 max-w-[calc(100%-2rem)] hover:bg-muted/50 focus:shadow-sm focus:bg-card focus:border-input focus:ml-0 focus:px-2 focus:max-w-[calc(100%-2rem)] transition-all truncate"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSave()
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
            ) : (
              <h2 className="text-base font-semibold truncate">{name}</h2>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {contactCount != null ? `${contactCount} Kontakte` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-6 pb-2 space-y-4">
        {/* DID badge */}
        <button
          onClick={handleCopyDid}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted transition-colors cursor-pointer group/did"
          title="DID kopieren"
        >
          <code className="text-[10px] font-mono text-muted-foreground tracking-tight">
            {shortDid}
          </code>
          {copied ? (
            <Check className="h-3 w-3 text-green-600 shrink-0" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground/50 group-hover/did:text-muted-foreground shrink-0 transition-colors" />
          )}
        </button>

        {profileUrl && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(profileUrl)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 2000)
            }}
          >
            {linkCopied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {linkCopied ? "Link kopiert!" : "Profil-Link kopieren"}
          </Button>
        )}

        {onAddContact && contactStatus !== "active" && (
          <Button
            size="sm"
            className="w-full"
            disabled={requesting || (contactDirection !== "incoming" && (requested || contactStatus === "pending"))}
            onClick={async () => {
              setRequesting(true)
              try {
                await onAddContact()
                setRequested(true)
              } catch (err) {
                setError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen")
              } finally {
                setRequesting(false)
              }
            }}
          >
            {contactStatus === "pending" && contactDirection === "incoming"
              ? (requesting ? "Bestätige…" : "Anfrage bestätigen")
              : contactStatus === "pending" || requested
                ? "Anfrage gesendet"
                : requesting ? "Sende…" : "Als Kontakt anfragen"}
          </Button>
        )}
        {onAddContact && contactStatus === "active" && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-green-600" /> Ihr seid Kontakte
          </p>
        )}

        {isEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor="profile-bio" className="text-xs text-muted-foreground">Ueber mich</Label>
            <Input
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Ein kurzer Satz ueber dich (optional)"
              className="h-9"
            />
          </div>
        ) : (
          bio.trim() && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Ueber</p>
              <p className="text-sm">{bio}</p>
            </div>
          )
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Footer — only edit mode needs actions; view relies on the
          panel's own close control. */}
      {isEdit && (
        <div className="mt-auto flex justify-end gap-2 px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </div>
      )}
    </div>
  )
}
