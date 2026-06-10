"use client"

import * as React from "react"
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  Eye,
  MapPin,
  Calendar,
  Image,
  Users,
  Hash,
  BarChart3,
  FolderOpen,
} from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Textarea } from "@/components/primitives/textarea"
import { cn } from "@/lib/utils"
import { TiptapEditor, type TiptapEditorHandle } from "./tiptap-editor"

type WidgetType =
  | "title"
  | "text"
  | "media"
  | "date"
  | "location"
  | "people"
  | "tags"
  | "status"
  | "group"

const WIDGET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  media: Image,
  date: Calendar,
  location: MapPin,
  people: Users,
  tags: Hash,
  status: BarChart3,
  group: FolderOpen,
}

const WIDGET_LABELS: Record<string, string> = {
  media: "Medien",
  date: "Datum",
  location: "Ort",
  people: "Personen",
  tags: "Tags",
  status: "Status",
  group: "Gruppe",
}

interface TextWidgetProps {
  value: string
  onChange: (value: string) => void
  label: string
  availableWidgets?: WidgetType[]
  onToggleWidget?: (widget: WidgetType) => void
  onMention?: (name: string) => void
  onHashtag?: (tag: string) => void
  autoFocus?: boolean
}

type FormatAction =
  | "bold"
  | "italic"
  | "h1"
  | "h2"
  | "ul"
  | "ol"
  | "quote"
  | "code"

export function TextWidget({
  value,
  onChange,
  label,
  availableWidgets = [],
  onToggleWidget,
  onMention,
  onHashtag,
  autoFocus,
}: TextWidgetProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const tiptapRef = React.useRef<TiptapEditorHandle>(null)
  const [mode, setMode] = React.useState<"visual" | "source">("visual")

  const applyFormat = (format: FormatAction) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const { selectionStart, selectionEnd, value: text } = textarea
    const selected = text.substring(selectionStart, selectionEnd)
    let before = ""
    let after = ""
    let linePrefix = ""

    switch (format) {
      case "bold":
        before = "**"
        after = "**"
        break
      case "italic":
        before = "*"
        after = "*"
        break
      case "h1":
        linePrefix = "# "
        break
      case "h2":
        linePrefix = "## "
        break
      case "ul":
        linePrefix = "- "
        break
      case "ol":
        linePrefix = "1. "
        break
      case "quote":
        linePrefix = "> "
        break
      case "code":
        if (selected.includes("\n")) {
          before = "```\n"
          after = "\n```"
        } else {
          before = "`"
          after = "`"
        }
        break
    }

    let newValue: string
    let newCursorStart: number
    let newCursorEnd: number

    if (linePrefix) {
      const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1
      newValue =
        text.substring(0, lineStart) +
        linePrefix +
        text.substring(lineStart)
      newCursorStart = selectionStart + linePrefix.length
      newCursorEnd = selectionEnd + linePrefix.length
    } else {
      newValue =
        text.substring(0, selectionStart) +
        before +
        selected +
        after +
        text.substring(selectionEnd)
      newCursorStart = selectionStart + before.length
      newCursorEnd = selectionEnd + before.length
    }

    onChange(newValue)
    requestAnimationFrame(() => {
      textarea.setSelectionRange(newCursorStart, newCursorEnd)
      textarea.focus()
    })
  }

  const applyVisualFormat = (format: FormatAction) => {
    const editor = tiptapRef.current?.editor
    if (!editor) return

    const chain = editor.chain().focus()
    switch (format) {
      case "bold":
        chain.toggleBold().run()
        break
      case "italic":
        chain.toggleItalic().run()
        break
      case "h1":
        chain.toggleHeading({ level: 1 }).run()
        break
      case "h2":
        chain.toggleHeading({ level: 2 }).run()
        break
      case "ul":
        chain.toggleBulletList().run()
        break
      case "ol":
        chain.toggleOrderedList().run()
        break
      case "quote":
        chain.toggleBlockquote().run()
        break
      case "code":
        if (editor.isActive("codeBlock")) {
          chain.toggleCodeBlock().run()
        } else if (editor.state.selection.content().size > 0 && editor.state.selection.content().content.childCount > 1) {
          chain.toggleCodeBlock().run()
        } else {
          chain.toggleCode().run()
        }
        break
    }
  }

  const isFormatActive = (format: FormatAction): boolean => {
    if (mode !== "visual") return false
    const editor = tiptapRef.current?.editor
    if (!editor) return false

    switch (format) {
      case "bold":
        return editor.isActive("bold")
      case "italic":
        return editor.isActive("italic")
      case "h1":
        return editor.isActive("heading", { level: 1 })
      case "h2":
        return editor.isActive("heading", { level: 2 })
      case "ul":
        return editor.isActive("bulletList")
      case "ol":
        return editor.isActive("orderedList")
      case "quote":
        return editor.isActive("blockquote")
      case "code":
        return editor.isActive("code") || editor.isActive("codeBlock")
    }
  }

  const handleTextChange = (newValue: string) => {
    onChange(newValue)

    if (onMention) {
      const mentionMatch = newValue.match(/@(\w+)\s$/m)
      if (mentionMatch) {
        onMention(mentionMatch[1])
      }
    }

    if (onHashtag) {
      const tagMatch = newValue.match(/#(\w+)\s$/m)
      if (tagMatch) {
        onHashtag(tagMatch[1])
      }
    }
  }

  const handleModeToggle = () => {
    const newMode = mode === "visual" ? "source" : "visual"
    setMode(newMode)
    requestAnimationFrame(() => {
      if (newMode === "source") {
        textareaRef.current?.focus()
      } else {
        tiptapRef.current?.editor?.commands.focus()
      }
    })
  }

  const formatButtons: { format: FormatAction; icon: React.ComponentType<{ className?: string }>; title: string }[] = [
    { format: "bold", icon: Bold, title: "Fett" },
    { format: "italic", icon: Italic, title: "Kursiv" },
    { format: "h1", icon: Heading1, title: "Ueberschrift 1" },
    { format: "h2", icon: Heading2, title: "Ueberschrift 2" },
    { format: "ul", icon: List, title: "Liste" },
    { format: "ol", icon: ListOrdered, title: "Nummerierte Liste" },
    { format: "quote", icon: Quote, title: "Zitat" },
    { format: "code", icon: Code, title: "Code" },
  ]

  const ModeIcon = mode === "visual" ? Code2 : Eye

  return (
    <div>
      {/* Formatting toolbar (top) */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-input bg-muted/30 px-1 py-0.5">
        {formatButtons.map(({ format, icon: Icon, title }) => (
          <Button
            key={format}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={title}
            onClick={() =>
              mode === "visual" ? applyVisualFormat(format) : applyFormat(format)
            }
            className={cn("h-7 w-7", isFormatActive(format) && "bg-accent")}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={mode === "visual" ? "Quelltext" : "Visuell"}
          onClick={handleModeToggle}
          className="h-7 w-7 ml-auto"
        >
          <ModeIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Editor area */}
      {mode === "visual" ? (
        <TiptapEditor
          ref={tiptapRef}
          value={value}
          onChange={handleTextChange}
          placeholder={label}
          autoFocus={autoFocus}
          className={cn(
            "min-h-[120px] rounded-t-none border border-t-0 border-input px-3 py-2 text-sm",
            availableWidgets.length > 0 && onToggleWidget && "rounded-b-none border-b-0 shadow-none",
          )}
        />
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={label}
          className={cn(
            "min-h-[120px] resize-y rounded-t-none border-t-0 font-mono",
            availableWidgets.length > 0 && onToggleWidget && "rounded-b-none border-b-0 shadow-none",
          )}
        />
      )}
      {/* Widget toggle icons (bottom bar) */}
      {availableWidgets.length > 0 && onToggleWidget && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-b-md border border-t-0 border-input px-1 py-0.5">
          {availableWidgets.map((widgetId) => {
            const Icon = WIDGET_ICONS[widgetId]
            if (!Icon) return null
            return (
              <Button
                key={widgetId}
                type="button"
                variant="ghost"
                size="icon-sm"
                title={WIDGET_LABELS[widgetId]}
                onClick={() => onToggleWidget(widgetId)}
                className="h-7 w-7 text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
