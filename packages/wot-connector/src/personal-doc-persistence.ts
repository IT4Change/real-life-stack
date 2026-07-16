import {
  CompactStorageManager,
  type PublicIdentitySession,
} from "@real-life/wot-core"
import type { DocLogStore, MessagingAdapter } from "@real-life/wot-core/ports"
import { initYjsPersonalDoc } from "@real-life/adapter-yjs"

const PERSONAL_DOC_COMPACT_STORE_PREFIX = "wot-yjs-compact-store"

/**
 * Unsuffixed databases from before identity-scoped persistence.
 *
 * `wot-yjs-compact-store` is the actual default opened by the 0.3.0
 * YjsPersonalDocManager when no external CompactStore is supplied. `personal-doc`
 * is the historical y-indexeddb namespace. The remaining names are the existing
 * connector migration set for global Yjs/Automerge state.
 */
export const LEGACY_IDENTITY_DB_NAMES = [
  "wot-yjs-compact-store",
  "personal-doc",
  "rls-yjs-space-compact-store",
  "automerge-personal",
  "automerge-repo",
  "rls-space-compact-store",
  "rls-space-sync-states",
  "wot-compact-store",
  "wot-sync-states",
] as const

export function personalDocCompactStoreName(did: string): string {
  return `${PERSONAL_DOC_COMPACT_STORE_PREFIX}:${did}`
}

export async function deleteLegacyIdentityDatabases(): Promise<void> {
  for (const name of LEGACY_IDENTITY_DB_NAMES) {
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })
    } catch {
      // Best effort: persistence isolation does not depend on legacy deletion.
    }
  }
}

/**
 * Initialize the Yjs PersonalDoc on a store whose database name is derived from
 * the authenticated DID. Supplying this store bypasses the manager's global
 * `wot-yjs-compact-store` default completely.
 */
export async function initNamespacedYjsPersonalDoc(
  identity: PublicIdentitySession,
  messaging?: MessagingAdapter,
  logSync?: { docLogStore: DocLogStore; deviceId: string },
): Promise<void> {
  const compactStore = new CompactStorageManager(
    personalDocCompactStoreName(identity.getDid()),
  )

  await compactStore.open()
  let isEmpty: boolean
  try {
    isEmpty = (await compactStore.list()).length === 0
  } finally {
    compactStore.close()
  }

  // A DID without namespaced state must never adopt an unsuffixed PersonalDoc.
  // Delete all pre-namespacing stores before the manager gets a chance to load.
  if (isEmpty) await deleteLegacyIdentityDatabases()

  await initYjsPersonalDoc(
    identity,
    messaging,
    undefined,
    compactStore,
    logSync,
  )
}
