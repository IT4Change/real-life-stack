# WoT Connector — Feature Parity Check

> Systematic comparison: WoT Demo App vs WoT Connector (Real Life Stack)
>
> **Created:** 2026-03-16
> **Purpose:** Ensure the WoT Connector provides all features that the Demo App has

---

## Closed parity gaps

| # | Feature | Demo App | Connector | Priority | Status |
|---|---------|----------|-----------|----------|--------|
| 1 | **Profile update notification** | Sends `profile-update` message to all contacts on name/avatar change | `broadcastProfileUpdate()` | HIGH | ✅ DONE |
| 2 | **Profile update handler** | Listens for `profile-update`, fetches new profile from discovery, updates local contact | Handler in `handleIncomingMessage()` | HIGH | ✅ DONE |
| 3 | **Contact profile sync on init** | On mount, fetches all contact profiles from discovery, updates names/avatars | `syncContactProfiles()` on init | HIGH | ✅ DONE |
| 4 | **Attestation ACK handler** | `attestation-ack` message listener confirms delivery | Handler in `handleIncomingMessage()` | MEDIUM | ✅ DONE |
| 5 | **Attestation retry** | `retryAttestation(id)` reconstructs + resends | `retryClaim()` implemented | MEDIUM | ✅ DONE |
| 6 | **Attestation signature verification** | Verifies incoming attestation signatures | Ed25519 verify in `handleIncomingMessage()` | MEDIUM | ✅ DONE |
| 7 | **Attestation send via relay** | `createAttestation()` sends via messaging | `createClaim()` sends via outboxAdapter | MEDIUM | ✅ DONE |
| 8 | **Incoming attestation + auto-ACK** | Receive, store, send ACK automatically | Full handler + ACK in `handleIncomingMessage()` | MEDIUM | ✅ DONE |
| 9 | **OfflineFirstDiscoveryAdapter** | Wraps HttpDiscoveryAdapter with local cache + dirty flags | Wraps with InMemory stores | LOW | ✅ DONE |
| 10 | **Dirty flag sync** | Tracks failed profile publishes, retries on reconnect | `syncDiscoveryPending()` on relay reconnect | LOW | ✅ DONE |

## Partial (works but different)

| # | Feature | Demo App | Connector | Notes |
|---|---------|----------|-----------|-------|
| 1 | Attestation model | Full `Attestation` with metadata, export/import | `ConfirmationView` projection over WoT attestations | Different abstraction, same crypto |
| 2 | Attestation delivery tracking | Full ACK-based receipt tracking | Connector-owned outbox + ACK handling | ✅ Now confirms via ACK |
| 3 | Member update handling | Explicit `member-update` message handler | Automatic via `watchSpaces()` | Both work, different approach |
| 4 | Personal sync | Cross-device `personal-sync` message handler | Handled by `YjsPersonalDocManager` internally | Both work |
| 5 | Profile caching | `graphCacheStore` + `LocalCacheStore` for offline | Relies on PersonalDoc contacts | Connector has contacts cached in Yjs, no separate graph cache |
| 6 | Mutual verification | Reactive via `watchAllVerifications()` + UI effect | Explicit `checkMutualVerification()` + event | Both detect, different UX dispatch |

## Fully Implemented

- Identity lifecycle (create, unlock, store, restore, seed recovery)
- Profile management (create, update, publish to discovery)
- Contact management (add, activate, update name, remove, reactive list)
- Verification flow (QR challenge, response, counter-verify, signature verify)
- Space/Group management (create, join, invite member, remove member, sync)
- Messaging infrastructure (WebSocket, outbox, reconnect)
- Multi-device sync (Vault restore, PersonalDoc sync via relay)
- Offline behavior (outbox queueing, CompactStore persistence, reconnect flush)
- Crypto (Ed25519 sign/verify, X25519 ECIES, AES-256-GCM, HKDF)
- Reactive patterns (watchContacts, watchVerifications, watchAttestations, watchSpaces)
- All observable state (auth, relay, items, confirmations, groups, outbox count)

---

## Resolved work

### Phase 1: Contact Name Reactivity (HIGH)
1. Add `profile-update` message handler in `handleIncomingMessage()`
2. On `profile-update` → fetch profile from discovery → `storage.updateContact()`
3. Send `profile-update` to all contacts when own profile changes (in `updateProfile()`)
4. Sync all contact profiles from discovery on init

### Phase 2: Attestation Completeness (MEDIUM)
5. Handle `attestation-ack` messages → update delivery status
6. Keep attestation retry logic connector-owned
7. Verify incoming attestation signatures

### Phase 3: Offline Resilience (LOW)
8. Wrap discovery with `OfflineFirstDiscoveryAdapter`
9. Track dirty flags for failed profile publishes
