import { useState, useEffect, useRef } from "react"
import { Copy, Check, ImagePlus, X, Camera, Pencil } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "../primitives/dialog"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import { resolveAssetUrl } from "../../lib/utils"
import { Label } from "../primitives/label"

export interface ProfileData {
  did: string
  name: string
  bio?: string
  avatar?: string
}

export interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileData
  contactCount?: number
  onSave: (updates: { name: string; bio: string; avatar?: string }) => Promise<void>
}

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  contactCount,
  onSave,
}: ProfileDialogProps) {
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio ?? "")
  const [avatar, setAvatar] = useState(profile.avatar ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(profile.name)
    setBio(profile.bio ?? "")
    setAvatar(profile.avatar ?? "")
  }, [profile.name, profile.bio, profile.avatar])

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
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), bio: bio.trim(), avatar })
      onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Profil bearbeiten</DialogTitle>
        {/* Profile Identity Header */}
        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative group shrink-0">
              {avatar ? (
                <>
                  <img src={resolveAssetUrl(avatar)} alt={name} className="w-14 h-14 rounded-full object-cover ring-2 ring-background shadow-sm" />
                  <button
                    onClick={() => setAvatar("")}
                    className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <label className="absolute -bottom-0.5 -right-0.5 p-1 bg-card border border-border rounded-full shadow-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent">
                    <Camera className="h-2.5 w-2.5 text-muted-foreground" />
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                </>
              ) : (
                <label className="w-14 h-14 rounded-full border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex items-center justify-center cursor-pointer transition-all hover:bg-muted/50">
                  <ImagePlus className="h-5 w-5 text-muted-foreground/40" />
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Name + Meta */}
            <div className="flex-1 min-w-0 -mt-1 group/name">
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

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
