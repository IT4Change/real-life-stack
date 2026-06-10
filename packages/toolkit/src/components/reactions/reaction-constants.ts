/** The 16 available reaction emojis. */
export const REACTION_EMOJIS = [
  "❤️", "👍", "👎", "😂", "😮", "😢", "😡", "🙏",
  "🔥", "🎉", "🤔", "💪", "🚀", "✨", "👀", "🤝",
] as const

export type ReactionEmoji = typeof REACTION_EMOJIS[number]

/** Human-readable names for accessibility (aria-label). */
export const REACTION_NAMES: Record<string, string> = {
  "❤️": "Heart",
  "👍": "Thumbs up",
  "👎": "Thumbs down",
  "😂": "Laughing",
  "😮": "Surprised",
  "😢": "Sad",
  "😡": "Angry",
  "🙏": "Pray",
  "🔥": "Fire",
  "🎉": "Party",
  "🤔": "Thinking",
  "💪": "Strong",
  "🚀": "Rocket",
  "✨": "Sparkles",
  "👀": "Eyes",
  "🤝": "Handshake",
}
