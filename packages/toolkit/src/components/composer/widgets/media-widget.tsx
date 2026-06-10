"use client"

import * as React from "react"
import { ImagePlus, X, GripVertical } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

interface MediaFile {
  id: string
  name: string
  url: string
  type?: string
}

interface MediaWidgetProps {
  value: MediaFile[]
  onChange: (value: MediaFile[]) => void
  label: string
}

export function MediaWidget({ value, onChange, label: _label }: MediaWidgetProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newMedia: MediaFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type,
    }))
    onChange([...value, ...newMedia])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (id: string) => {
    const file = value.find((f) => f.id === id)
    if (file?.url.startsWith("blob:")) {
      URL.revokeObjectURL(file.url)
    }
    onChange(value.filter((f) => f.id !== id))
  }

  // Pointer-based drag-and-drop for reordering
  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    // Only handle primary button
    if (e.button !== 0) return
    setDragIndex(index)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return
    const elements = document.querySelectorAll("[data-media-item]")
    for (let i = 0; i < elements.length; i++) {
      const rect = elements[i].getBoundingClientRect()
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        setOverIndex(i)
        break
      }
    }
  }

  const handlePointerUp = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const newValue = [...value]
      const [moved] = newValue.splice(dragIndex, 1)
      newValue.splice(overIndex, 0, moved)
      onChange(newValue)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  const isImage = (file: MediaFile) =>
    file.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)

  return (
    <div className="space-y-2">
      {/* Media grid */}
      {value.length > 0 && (
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {value.map((file, index) => (
            <div
              key={file.id}
              data-media-item
              className={cn(
                "group relative aspect-square overflow-hidden rounded-md border bg-muted",
                dragIndex === index && "opacity-50",
                overIndex === index &&
                  dragIndex !== null &&
                  dragIndex !== index &&
                  "ring-2 ring-primary",
              )}
            >
              {isImage(file) ? (
                <img
                  src={file.url}
                  alt={file.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {file.name}
                </div>
              )}
              {/* Controls overlay */}
              <div className="absolute inset-0 flex items-start justify-between bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
                <button
                  type="button"
                  className="cursor-grab rounded bg-black/40 p-0.5 text-white touch-none"
                  onPointerDown={(e) => handlePointerDown(e, index)}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  className="rounded bg-black/40 p-0.5 text-white hover:bg-black/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="gap-1.5"
      >
        <ImagePlus className="h-4 w-4" />
        Dateien hinzufuegen
      </Button>
    </div>
  )
}
