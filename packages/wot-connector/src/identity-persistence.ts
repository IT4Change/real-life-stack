export const ACTIVE_DID_STORAGE_KEY = "rls-wot-active-did"

/**
 * Every IndexedDB database whose lifetime is bound to one local identity.
 *
 * Runtime construction and full-wipe both use this table so a newly introduced
 * DID-scoped store cannot silently survive logout or an identity switch.
 */
export const IDENTITY_DATABASE_PREFIXES = {
  personalDocCompact: "wot-yjs-compact-store",
  docLog: "wot-doc-log",
  keyManagement: "wot-key-management",
  memberUpdatePending: "wot-member-update-pending",
  messageIdHistory: "wot-message-id-history",
  outbox: "wot-outbox",
  "work-queue": "wot-work-queue",
  spaceCompact: "rls-yjs-space-compact-store",
} as const

export type IdentityDatabaseKind = keyof typeof IDENTITY_DATABASE_PREFIXES

export function identityDatabaseName(kind: IdentityDatabaseKind, did: string): string {
  return `${IDENTITY_DATABASE_PREFIXES[kind]}:${did}`
}

export function identityDatabaseNames(did: string): string[] {
  return (Object.keys(IDENTITY_DATABASE_PREFIXES) as IdentityDatabaseKind[])
    .map((kind) => identityDatabaseName(kind, did))
}

/** Unsuffixed databases from before identity-scoped persistence. */
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

/**
 * Full local wipe for one DID. Callers must stop replication/messaging and close
 * every runtime store before invoking this function; a blocked delete is an
 * error, never a successful wipe.
 */
export async function wipeIdentityPersistence(did: string): Promise<void> {
  // Best-effort über ALLE Datenbanken: ein blockiertes Delete darf die übrigen
  // DID-Datenbanken und den Legacy-Wipe nicht überspringen (CodeRabbit #143).
  // Fehler werden gesammelt und am Ende geworfen — ein blockiertes Delete ist
  // weiterhin ein Fehler, nie ein erfolgreicher Wipe.
  const failures: unknown[] = []
  for (const name of identityDatabaseNames(did)) {
    try {
      await deleteIndexedDatabase(name)
    } catch (error) {
      failures.push(error)
    }
  }
  await deleteLegacyIdentityDatabases()
  if (failures.length > 0) {
    // Portabler Sammel-Fehler (lib-Target < ES2021, kein AggregateError-Typ).
    const error = new Error(`wipeIdentityPersistence: ${failures.length} Datenbank(en) nicht gelöscht`)
    ;(error as Error & { failures?: unknown[] }).failures = failures
    throw error
  }
}

export async function deleteLegacyIdentityDatabases(): Promise<void> {
  for (const name of LEGACY_IDENTITY_DB_NAMES) {
    try {
      await deleteIndexedDatabase(name)
    } catch {
      // Best effort: identity isolation does not depend on legacy deletion.
    }
  }
}

async function deleteIndexedDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB delete failed: ${name}`))
    request.onblocked = () => reject(new Error(`IndexedDB delete blocked by an open connection: ${name}`))
  })
}
