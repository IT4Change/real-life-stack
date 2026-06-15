const PASSPHRASE_LENGTH = 32

export function generateRandomPassphrase(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  // Rejection sampling: discard byte values in the final, partial block so every
  // character is equally likely. A plain `b % chars.length` would otherwise bias
  // the first (256 % chars.length) characters.
  const limit = 256 - (256 % chars.length)
  const out: string[] = []
  while (out.length < PASSPHRASE_LENGTH) {
    const buf = new Uint8Array(PASSPHRASE_LENGTH - out.length)
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b < limit) out.push(chars[b % chars.length])
    }
  }
  return out.join('')
}
