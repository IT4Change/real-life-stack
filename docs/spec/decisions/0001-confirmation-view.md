# 0001: Use Confirmation as the Neutral RLS Trust Projection

**Status:** Accepted for spec direction

## Context

RLS currently exposes WoT-style trust data through `SignedClaim` and `SignedClaimCapable`.

That naming fits signed WoT attestations, but it is too narrow for backend-agnostic RLS:

- server backends can confirm events without portable signatures,
- local and demo connectors can show weaker evidence,
- RLNP/Game views need a common projection for quest completion, participation, verification and attestations,
- UI code must not imply that every visible confirmation is cryptographically signed.

## Decision

RLS uses **Confirmation** as the neutral technical term for a backend-agnostic confirmed statement or event.

`Attestation` remains the term for portable signed confirmations, especially WoT VC-JWS attestations.

`Recognition` remains a UI/social/game interpretation: a human-readable acknowledgement, badge or visible appreciation derived from a confirmation.

## Consequences

- New RLNP/Game specs should prefer `ConfirmationView` over `RecognitionView`.
- Trust level must be explicit in the RLS projection.
- WoT remains the strongest trust source, but not the only possible backend source.
- RLS does not need a permanent compatibility projection for legacy `SignedClaim` data.
- Future code work should replace `SignedClaim`/`SignedClaimCapable` with `ConfirmationView`/`ConfirmationCapable`.
- QR verification should be split out instead of being kept inside the generic confirmation capability.
- Delivery/outbox status remains connector-owned and is not part of `ConfirmationView` or `ConfirmationCapable`.
