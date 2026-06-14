export function generateRandomPassphrase(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => chars[b % chars.length]).join('')
}
