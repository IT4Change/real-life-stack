import type { ContactInfo } from "@real-life-stack/data-interface"
import { Users } from "lucide-react"

import { ContactCard } from "./contact-card"
import { cn } from "@/lib/utils"

export interface ContactListProps {
  contacts: ContactInfo[]
  onRemove?: (id: string) => void
  onEditName?: (id: string, name: string) => void
  onActivate?: (id: string) => void
  activeLabel?: string
  emptyMessage?: string
  className?: string
}

export function ContactList({
  contacts,
  onRemove,
  onEditName,
  onActivate,
  activeLabel,
  emptyMessage = "Noch keine Kontakte",
  className,
}: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-muted-foreground", className)}>
        <Users className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onRemove={onRemove}
          onEditName={onEditName}
          onActivate={onActivate}
          activeLabel={activeLabel}
        />
      ))}
    </div>
  )
}
