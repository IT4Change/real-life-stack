import { useState } from "react"
import { Copy, Check, Trash2, Pencil } from "lucide-react"
import type { ContactInfo } from "@real-life-stack/data-interface"

import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { Button } from "../primitives/button"
import { ProfileLink } from "../profile/profile-link"
import { cn } from "@/lib/utils"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function truncateId(id: string, maxLength = 16): string {
  if (id.length <= maxLength) return id
  return `${id.slice(0, 8)}…${id.slice(-6)}`
}

export interface ContactCardProps {
  contact: ContactInfo
  onRemove?: (id: string) => void
  onEditName?: (id: string, name: string) => void
  className?: string
}

export function ContactCard({
  contact,
  onRemove,
  onEditName,
  className,
}: ContactCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(contact.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayName = contact.name || `User-${contact.id.slice(-6)}`

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
        className
      )}
    >
      <ProfileLink userId={contact.id} label={`Profil von ${displayName} öffnen`}>
        <Avatar className="h-10 w-10">
          <AvatarImage src={contact.avatar} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {contact.name ? getInitials(contact.name) : "?"}
          </AvatarFallback>
        </Avatar>
      </ProfileLink>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{displayName}</p>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              contact.status === "active"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}
          >
            {contact.status === "active" ? "Verifiziert" : "Ausstehend"}
          </span>
        </div>
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="ID kopieren"
        >
          <code className="font-mono truncate max-w-[180px]">
            {truncateId(contact.id)}
          </code>
          {copied ? (
            <Check className="h-3 w-3 text-green-500 shrink-0" />
          ) : (
            <Copy className="h-3 w-3 shrink-0" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onEditName && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              const newName = window.prompt("Name ändern:", contact.name || "")
              if (newName !== null && newName.trim()) {
                onEditName(contact.id, newName.trim())
              }
            }}
            title="Name bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(contact.id)}
            title="Kontakt entfernen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
