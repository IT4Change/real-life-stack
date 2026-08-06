"use client"

import { useState } from "react"
import { ImageOff } from "lucide-react"
import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
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
 *
 * Third-party images are NOT loaded automatically — see {@link RemoteImage}.
 */

/**
 * Images whose bytes never leave the device: data URIs and locally created
 * object URLs. Everything else is a request to a foreign host.
 */
function isLocalImageSource(src: string): boolean {
  return src.startsWith("data:image/") || src.startsWith("blob:")
}

/**
 * react-markdown strips every protocol outside its safe list, which also
 * kills the two the app itself produces: resized uploads (`data:image/…`)
 * and object URLs (`blob:`). Both are allowed back — but ONLY as an image
 * `src`. As an `href` they would be an attack surface (`data:text/html`
 * navigates to attacker markup); scripts inside an SVG do not execute when
 * it is loaded through `<img>`.
 */
function transformUrl(url: string, key: string, node: Readonly<{ tagName?: string }>): string {
  const isImageSource = key === "src" && node.tagName === "img"
  if (isImageSource && isLocalImageSource(url)) return url
  return defaultUrlTransform(url)
}

/**
 * An image from a foreign host, shown only on request.
 *
 * Rendering `![](https://tracker/x.png)` straight away would fetch it the
 * moment the item appears — a tracking pixel that reports "this person read
 * this" to a third party, and leaks the IP address with it. Anyone who can
 * write an item could plant one. So the reader decides: the placeholder names
 * the image, one click loads it (rls#257). Same trade-off mail clients make.
 */
function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  if (loaded) return <img src={src} alt={alt} className="my-2 max-w-full rounded-lg" />
  return (
    <button
      type="button"
      onClick={(event) => {
        // The card itself is clickable — loading an image must not open the item.
        event.stopPropagation()
        setLoaded(true)
      }}
      title={src}
      className="my-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary hover:text-foreground"
    >
      <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{alt || "Externes Bild"}</span>
      <span className="shrink-0 underline underline-offset-2">Bild laden</span>
    </button>
  )
}
export function MarkdownText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformUrl}
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
          img: ({ src, alt }) => {
            if (typeof src !== "string" || !src) return null
            const label = alt ?? ""
            return isLocalImageSource(src) ? (
              <img src={src} alt={label} className="my-2 max-w-full rounded-lg" />
            ) : (
              <RemoteImage src={src} alt={label} />
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
