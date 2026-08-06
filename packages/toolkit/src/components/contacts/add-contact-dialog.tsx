import { useState } from "react"
import { UserPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../primitives/dialog"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import { Label } from "../primitives/label"

export interface AddContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (id: string, name?: string) => Promise<unknown>
}

export function AddContactDialog({
  open,
  onOpenChange,
  onAdd,
}: AddContactDialogProps) {
  const [contactId, setContactId] = useState("")
  const [contactName, setContactName] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    const id = contactId.trim()
    if (!id) return

    setAdding(true)
    setError(null)
    try {
      await onAdd(id, contactName.trim() || undefined)
      setContactId("")
      setContactName("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Hinzufügen")
    } finally {
      setAdding(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setContactId("")
      setContactName("")
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Kontakt hinzufügen
          </DialogTitle>
          <DialogDescription>
            Füge den Profil-Link oder die ID der Person ein, die du als Kontakt anfragen möchtest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-id">Profil-Link oder ID</Label>
            <Input
              id="contact-id"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              placeholder="https://… oder ID"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleAdd()
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-name">Name (optional)</Label>
            <Input
              id="contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Name der Person"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleAdd()
                }
              }}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={adding}>
            Abbrechen
          </Button>
          <Button onClick={handleAdd} disabled={adding || !contactId.trim()}>
            {adding ? "Hinzufügen..." : "Hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
