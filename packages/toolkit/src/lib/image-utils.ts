/**
 * Resize and compress an image file to a square WebP data URL.
 * - SVGs are kept as-is (lossless, scalable)
 * - Raster images: center-crops to square, resizes to maxSize × maxSize, compresses as WebP
 */
export function resizeImage(file: File, maxSize = 200, quality = 0.8): Promise<string> {
  // SVGs don't need rasterization — return as data URL directly
  if (file.type === "image/svg+xml") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read SVG"))
      reader.readAsDataURL(file)
    })
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement("canvas")
      canvas.width = maxSize
      canvas.height = maxSize

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas not supported"))
        return
      }

      // Center-crop to square
      const srcSize = Math.min(img.naturalWidth, img.naturalHeight)
      const srcX = (img.naturalWidth - srcSize) / 2
      const srcY = (img.naturalHeight - srcSize) / 2

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, maxSize, maxSize)

      resolve(canvas.toDataURL("image/webp", quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load image"))
    }

    img.src = url
  })
}

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0")

/**
 * Extract the dominant *saturated* color of an image as `#rrggbb`. Used once,
 * client-side, when a space logo is uploaded, to cache `primaryColor`.
 *
 * Near-transparent and low-saturation (gray/white/black) pixels are ignored so
 * the result is a real accent, not a muddy gray. Returns `null` when no
 * saturated color is found (e.g. a grayscale logo) — callers then fall back to
 * the deterministic id color.
 *
 * Best-effort for SVG sources: an SVG that fails to rasterize or taints the
 * canvas yields `null` (not a throw), so SVG logos may simply use the id-based
 * fallback. Raster logos (PNG/JPG/WebP) extract reliably.
 */
export function dominantColor(src: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = 32
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas not supported"))
        return
      }
      ctx.drawImage(img, 0, 0, size, size)
      let pixels: Uint8ClampedArray
      try {
        pixels = ctx.getImageData(0, 0, size, size).data
      } catch {
        // Tainted/unreadable canvas (e.g. some SVG sources) — treat as
        // "no extractable color" so the caller uses the id-based fallback.
        resolve(null)
        return
      }
      // Bucket quantized colors and accumulate sums for an averaged result.
      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        const a = pixels[i + 3]
        if (a < 128) continue
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const saturation = max === 0 ? 0 : (max - min) / max
        if (saturation < 0.2) continue
        const key = `${r >> 4},${g >> 4},${b >> 4}`
        const entry = buckets.get(key)
        if (entry) {
          entry.count++
          entry.r += r
          entry.g += g
          entry.b += b
        } else {
          buckets.set(key, { count: 1, r, g, b })
        }
      }
      let best: { count: number; r: number; g: number; b: number } | null = null
      for (const entry of buckets.values()) {
        if (!best || entry.count > best.count) best = entry
      }
      if (!best) {
        resolve(null)
        return
      }
      resolve(`#${toHex(best.r / best.count)}${toHex(best.g / best.count)}${toHex(best.b / best.count)}`)
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}
