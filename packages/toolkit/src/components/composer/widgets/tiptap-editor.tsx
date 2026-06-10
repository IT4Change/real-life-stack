"use client"

import * as React from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Markdown } from "tiptap-markdown"
import { cn } from "@/lib/utils"

export interface TiptapEditorHandle {
  editor: ReturnType<typeof useEditor>
}

interface TiptapEditorProps {
  value: string
  onChange: (md: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

export const TiptapEditor = React.forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  function TiptapEditor({ value, onChange, placeholder, autoFocus, className }, ref) {
    // Track whether the latest change originated from the editor itself.
    // When it did, we skip the sync effect to avoid a feedback loop.
    const isInternalChange = React.useRef(false)

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
        }),
        Markdown,
      ],
      autofocus: autoFocus ? "end" : false,
      content: value,
      onUpdate({ editor }) {
        const md = (editor.storage as Record<string, any>).markdown.getMarkdown() as string
        isInternalChange.current = true
        onChange(md)
      },
    })

    React.useImperativeHandle(ref, () => ({ editor }), [editor])

    // Sync external value changes into the editor
    React.useEffect(() => {
      if (!editor || editor.isDestroyed) return

      // If this render was triggered by our own onUpdate callback, skip.
      if (isInternalChange.current) {
        isInternalChange.current = false
        return
      }

      // External value changed (e.g. different task selected) — push into editor
      editor.commands.setContent(value, { emitUpdate: false })
    }, [value, editor])

    return (
      <EditorContent
        editor={editor}
        className={cn("tiptap-editor", className)}
        data-placeholder={placeholder}
      />
    )
  },
)
