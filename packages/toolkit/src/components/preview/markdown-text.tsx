"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "../../lib/utils"

/**
 * Renders item body text as Markdown.
 *
 * The composer already WRITES Markdown (tiptap-markdown), so rendering it is
 * correctness, not decoration — without this, a user who bolded a word saw
 * literal `**word**` on every card and in the detail panel.
 *
 * Deliberately no raw HTML: react-markdown ignores embedded HTML unless
 * `rehype-raw` is added, which keeps user text from injecting markup.
 * Element styling is explicit (not a prose plugin) so cards stay compact and
 * inherit the surrounding type scale.
 */
export function MarkdownText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          h1: ({ children }) => <h4 className="mb-1 mt-3 text-base font-semibold">{children}</h4>,
          h2: ({ children }) => <h4 className="mb-1 mt-3 text-base font-semibold">{children}</h4>,
          h3: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-semibold">{children}</h5>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-2 text-xs">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              // The card itself is clickable — a link must not also open the item.
              onClick={(event) => event.stopPropagation()}
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          img: ({ src, alt }) => (
            <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-2 max-w-full rounded-lg" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
