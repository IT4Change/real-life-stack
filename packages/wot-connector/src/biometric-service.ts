import { Capacitor, registerPlugin } from "@capacitor/core"

/**
 * Native bridge to the BiometricKeystore plugin (Android: see
 * apps/reference/android/.../BiometricKeystorePlugin.java). The plugin
 * stores the identity passphrase encrypted under a biometric-gated
 * Keystore key — the passphrase itself never leaves the device.
 *
 * This service is the WoT-connector's *contract*; the native
 * implementation is provided by the host app (which registers the plugin
 * in its MainActivity). On platforms/builds without the plugin — the
 * browser, or an app variant that didn't register it — every call is
 * gated by isAvailable()/isEnrolled() and degrades to password unlock.
 */
interface BiometricKeystorePlugin {
  isAvailable(): Promise<{ available: boolean; biometryType: string }>
  storePassphrase(options: { passphrase: string }): Promise<void>
  unlockPassphrase(): Promise<{ passphrase: string }>
  deletePassphrase(): Promise<void>
  hasStoredPassphrase(): Promise<{ stored: boolean }>
}

const BiometricKeystore = registerPlugin<BiometricKeystorePlugin>("BiometricKeystore")

export class BiometricService {
  /** Only native platforms can have the Keystore-backed plugin. */
  static isSupported(): boolean {
    return Capacitor.isNativePlatform()
  }

  /** Hardware present + a biometric/credential enrolled at the OS level. */
  static async isAvailable(): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const { available } = await BiometricKeystore.isAvailable()
      return available
    } catch {
      return false
    }
  }

  /** Store the passphrase behind a biometric prompt (opt-in). */
  static async enroll(passphrase: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("Biometric enrollment is not supported on this platform")
    }
    await BiometricKeystore.storePassphrase({ passphrase })
  }

  /** Prompt biometrics and return the decrypted passphrase. */
  static async authenticate(): Promise<string> {
    const { passphrase } = await BiometricKeystore.unlockPassphrase()
    return passphrase
  }

  /** Forget the stored passphrase and drop the Keystore key. */
  static async unenroll(): Promise<void> {
    await BiometricKeystore.deletePassphrase()
  }

  /** Whether a passphrase is currently stored for biometric unlock. */
  static async isEnrolled(): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const { stored } = await BiometricKeystore.hasStoredPassphrase()
      return stored
    } catch {
      return false
    }
  }
}
