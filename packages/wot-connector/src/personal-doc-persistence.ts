import type { CatchUpRegistry } from "@real-life/adapter-yjs"
import {
  CompactStorageManager,
  type PublicIdentitySession,
} from "@real-life/wot-core"
import type { DocLogStore, MessagingAdapter } from "@real-life/wot-core/ports"
import { initYjsPersonalDoc } from "@real-life/adapter-yjs"
import {
  deleteLegacyIdentityDatabases,
  identityDatabaseName,
} from "./identity-persistence.js"

export function personalDocCompactStoreName(did: string): string {
  return identityDatabaseName("personalDocCompact", did)
}

/**
 * Initialize the Yjs PersonalDoc on a store whose database name is derived from
 * the authenticated DID. Supplying this store bypasses the manager's global
 * `wot-yjs-compact-store` default completely.
 */
export async function initNamespacedYjsPersonalDoc(
  identity: PublicIdentitySession,
  messaging?: MessagingAdapter,
  logSync?: { docLogStore: DocLogStore; deviceId: string; catchUpRegistry?: CatchUpRegistry },
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
