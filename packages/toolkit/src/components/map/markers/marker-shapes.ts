/** Marker pin shapes Utopia shipped and we support. */
export type MarkerShape = "circle" | "square"

export const MARKER_SHAPES: readonly MarkerShape[] = ["circle", "square"]
export const DEFAULT_SHAPE: MarkerShape = "circle"

/** All shapes share one pin viewBox, size and anchor. */
export const PIN_VIEWBOX = "0 0 35 45"
export const PIN_SIZE = { width: 35, height: 45 }
/** Tip of the pin in viewBox units — the geographic anchor point. */
export const PIN_ANCHOR = { x: 17.5, y: 45 }
/** Centre of the glyph slot (the pin's top circle) in viewBox units. */
export const GLYPH_CENTER = { x: 17.5, y: 16.7 }

// `{fill}` = marker colour, `{border}` = outline. Path geometry is taken
// verbatim from Utopia's MarkerIconFactory (lib/src/Utils/MarkerIconFactory.ts).
const SHAPE_BODY: Record<MarkerShape, string> = {
  circle:
    '<path d="M17.5 2.746c-8.284 0-15 6.853-15 15.307 0 .963.098 1.902.265 2.816a15.413 15.413 0 002.262 5.684l.134.193 12.295 17.785 12.439-17.863.056-.08a15.422 15.422 0 002.343-6.112c.123-.791.206-1.597.206-2.423 0-8.454-6.716-15.307-15-15.307" fill="{fill}"/><path d="M17.488 2.748c-8.284 0-15 6.853-15 15.307 0 .963.098 1.902.265 2.816a15.413 15.413 0 002.262 5.684l.134.193 12.295 17.785 12.44-17.863.055-.08a15.422 15.422 0 002.343-6.112c.124-.791.206-1.597.206-2.423 0-8.454-6.716-15.307-15-15.307m0 1.071c7.68 0 13.929 6.386 13.929 14.236 0 .685-.064 1.423-.193 2.258-.325 2.075-1.059 3.99-2.164 5.667l-.055.078-11.557 16.595L6.032 26.14l-.12-.174a14.256 14.256 0 01-2.105-5.29 14.698 14.698 0 01-.247-2.62c0-7.851 6.249-14.237 13.928-14.237" fill="{border}"/>',
  square:
    '<path d="M28.205 3.217H6.777c-2.367 0-4.286 1.87-4.286 4.179v19.847c0 2.308 1.919 4.179 4.286 4.179h5.357l5.337 13.58 5.377-13.58h5.357c2.366 0 4.285-1.87 4.285-4.179V7.396c0-2.308-1.919-4.179-4.285-4.179" fill="{fill}"/><g transform="matrix(1.0714 0 0 -1.0714 -233.22 146.783)"><path d="M244 134h-20c-2.209 0-4-1.746-4-3.9v-18.525c0-2.154 1.791-3.9 4-3.9h5L233.982 95 239 107.675h5c2.209 0 4 1.746 4 3.9V130.1c0 2.154-1.791 3.9-4 3.9m0-1c1.654 0 3-1.301 3-2.9v-18.525c0-1.599-1.346-2.9-3-2.9h-5.68l-.25-.632-4.084-10.318-4.055 10.316-.249.634H224c-1.654 0-3 1.301-3 2.9V130.1c0 1.599 1.346 2.9 3 2.9h20" fill="{border}"/></g>',
}

/** Inner SVG markup for a pin shape with the given fill and outline colours. */
export function markerShapeBody(shape: MarkerShape, fill: string, border: string): string {
  return (SHAPE_BODY[shape] ?? SHAPE_BODY.circle)
    .replace(/\{fill\}/g, fill)
    .replace(/\{border\}/g, border)
}
