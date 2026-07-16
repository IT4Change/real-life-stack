# Mirror und Bridge — Items in mehreren Spaces

**Status:** Normativer Entwurf v0.1 (Vertrag aus P0 der Netzwerk-App;
Implementierung in P2, davor darf kein Code Mirrors erzeugen)

Diese Spec definiert, wie ein Item in mehreren Spaces erscheint: als
Referenz, nicht als Klon. Sie legt die Invarianten fest, gegen die P2
implementiert wird.

Code-Referenzen:

- `packages/wot-connector/src/CrossGroupIndex.ts` (heutiger Index, nackte `item.id`)
- `packages/wot-connector/src/types.ts` (`RlsSpaceDoc`, `SerializedItem`)
- [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Target-Konvention `space:{id}/item:`)

## Begriffe

- **Canonical Home:** der eine Space, in dem ein Item lebt und editiert wird.
- **Mirror:** ein read-only Snapshot des Items in einem anderen Space.
- **Bridge (Brücken-Client):** ein Client, der Mitglied beider Spaces ist und
  autor-signierte Snapshots vom Home in den Ziel-Space überträgt.

## Snapshot-Form

```ts
/**
 * Die PAYLOAD der Compact-JWS. Das Wire-Format ist die JWS selbst —
 * dieser Typ enthält deshalb bewusst KEIN signature-Feld.
 */
interface MirrorSnapshotPayload {
  homeSpaceId: string
  itemId: string
  /** der EINE Ziel-Space dieser Freigabe (Invariante 4) */
  targetSpaceId: string
  /** seq: home-weit replizierter Lamport-Zähler; ts: reine Anzeigezeit — Ordnung s. Invariante 6 */
  version: { seq: number; deviceId: string; ts: string }
  /** null = Tombstone (Item im Home gelöscht) */
  item: SerializedItem | null
  /** MUSS bei item ≠ null gleich item.createdBy sein (Invariante 5) */
  authorDid: string
}
```

**Kanonische signierte Payload:** Die Felder `homeSpaceId`, `itemId`,
`targetSpaceId`, `version`, `item`, `authorDid` werden nach **RFC 8785
(JSON Canonicalization Scheme)** serialisiert (UTF-8). Die JWS signiert
exakt diese Bytes; `tiebreak` in Invariante 6 ist `sha256` über dieselben
Bytes (lowercase Hex). Damit sind Signaturprüfung und Versionsvergleich
implementierungsunabhängig deterministisch.

**Wire-Format = nur die JWS:** Übertragen wird ausschließlich die
Compact-JWS (wie in `wot-core/src/protocol/crypto/jws.ts`); der
TypeScript-Typ oben beschreibt die **Payload-Struktur**, nicht das
Wire-Format. Empfänger MÜSSEN alle Feldwerte aus der verifizierten
JWS-Payload lesen. Unsignierte äußere Kopien der Felder sind unzulässig —
sonst prüft eine Implementierung die JWS und verwendet danach manipulierte
Außenfelder.

## Invarianten

1. Die Identität eines gespiegelten Items ist der zusammengesetzte Schlüssel
   `(homeSpaceId, itemId)`. Kein Index DARF Mirror-Instanzen unter nacktem
   `itemId` mit Home-Instanzen zusammenführen. Der heutige `CrossGroupIndex`
   erfüllt das nicht und DARF deshalb keine Mirrors führen. Zu trennen
   sind dabei logische und physische Identität: logisch ist das
   gespiegelte Item `(homeSpaceId, itemId)`, eine konkrete
   Mirror-Instanz ist `(targetSpaceId, homeSpaceId, itemId)` — Indizes
   über mehrere Ziel-Spaces MÜSSEN den vollen Tripel-Schlüssel verwenden,
   sonst kollabiert derselbe Mirror aus zwei Ziel-Spaces erneut.
2. Es gibt genau ein Home. Der Schreibpfad existiert nur dort; ein Mirror
   schreibt NIE zurück. Damit existiert kein Cross-Space-Merge und kein
   Konfliktmodell zwischen Spaces — „Konflikt" reduziert sich auf den
   Versionsvergleich beim Snapshot-Empfang.
3. Snapshots sind autor-signiert (`createdBy`-DID). Dritte KÖNNEN Snapshots
   weiterreichen, aber nicht fälschen. Das Spiegeln eines Items in einen
   anderen Space ist eine bewusste Freigabe des Autors.
4. Die Freigabe ist an den Ziel-Space gebunden: `targetSpaceId` ist Teil
   der signierten Payload, und Empfänger MÜSSEN sie gegen die ID des
   eigenen Space prüfen. Eine Bridge kann eine gültige Freigabe damit
   NICHT in andere Spaces weiterkopieren, deren Mitglied sie zufällig ist.
   Spiegeln in N Spaces bedeutet N signierte Snapshots (Empfängerprinzip:
   Offenlegung ist adressatengebunden).
5. Signer-Bindung: Signer ist ausschließlich `createdBy` des Items
   (`authorDid` MUSS bei `item ≠ null` gleich `item.createdBy` sein) —
   auch wenn im Home weitere Editoren schreiben dürfen. Deren Änderungen
   erreichen den Mirror erst, wenn der Autor den gemergten Home-Stand neu
   publiziert. Die Erst-Annahme bindet `(homeSpaceId, itemId)` an die
   Signer-DID; spätere Snapshots mit anderem Signer MÜSSEN verworfen
   werden (kein Umhängen der Identität). Die Bindung entsteht NUR durch
   einen Snapshot mit `item ≠ null` — dort ist `authorDid` gegen
   `item.createdBy` prüfbar. Tombstones etablieren NIE eine Bindung —
   sonst könnte ein gefälschter Erst-Tombstone die Identität fremdbinden
   und die Snapshots des echten Autors dauerhaft aussperren. Ein
   Tombstone zu einem unbekannten `(homeSpaceId, itemId)` wird aber NICHT
   verworfen, sondern als **ungebundene Tombstone-Marke**
   `(homeSpaceId, itemId, authorDid, version)` gespeichert: trifft später
   (Offline-Reihenfolge!) ein Live-Snapshot desselben `authorDid` mit
   niedrigerer `version` ein, MUSS er verworfen werden — sonst ersteht
   das gelöschte Item wieder auf. Live-Snapshots anderer Autoren bleiben
   von der Marke unberührt. Die Erst-Annahme ist dabei ausdrücklich
   **Home-Origin-TOFU**: der Empfänger ist im Home nicht Mitglied und
   kann die Behauptung, das Item stamme aus `homeSpaceId`, beim
   Erstkontakt nicht beweisen. Restrisiko: ein Angreifer kann ein noch
   ungespiegeltes `(homeSpaceId, itemId)` mit eigener DID besetzen; das
   blockiert genau diesen zusammengesetzten Schlüssel (und wird als
   Konflikt sichtbar, sobald der echte Autor publiziert), kompromittiert
   aber keine bestehenden Mirrors. UI-Flächen MÜSSEN die Herkunft als
   Behauptung ausweisen („laut Snapshot aus …"). Ein Provenienznachweis
   (Home-Mitgliedschafts-Beleg oder MirrorGrant) ist als Härtung
   vorgesehen, nicht Teil dieses Vertrags. Delegation an weitere Signer
   (z. B. UCAN) ist ebenfalls außerhalb — s. Nicht-Ziele (MirrorGrant).
6. Empfänger MÜSSEN die Signatur JEDES Snapshots (Live wie Tombstone)
   gegen dessen `authorDid` prüfen und führen pro
   `(homeSpaceId, itemId, authorDid)` die höchste akzeptierte `version`
   als High-Water-Mark über Live- UND Tombstone-Snapshots. Die
   Strikt-größer-Regel gilt je `authorDid`; **materialisiert** wird der
   Mirror ausschließlich aus Snapshots des gebundenen Signers
   (Invariante 5) — Marken fremder DIDs berühren ihn nicht. Ein Snapshot
   wird nur übernommen, wenn seine `version` in der totalen Ordnung
   STRIKT größer ist als die bisherige High-Water-Mark seines Autors.
   `seq` ist ein home-weit replizierter **Lamport-Zähler** pro
   gespiegeltem Item: die Freigabe samt letzter publizierter `seq` liegt
   als Registry im Home-Doc (dadurch sehen alle Autor-Geräte Freigabe und
   Zählerstand), und beim Publizieren gilt
   `seq = 1 + max(im Home beobachtete seq)`. Ein Gerät, das den gemergten
   Home-Stand publiziert, liegt damit immer über allen ihm bekannten
   Snapshots — getrennte lokale Zähler würden neuere Inhalte dauerhaft
   verwerfen lassen. Die totale Ordnung ist `(seq, deviceId, tiebreak)`
   lexikographisch mit `tiebreak = sha256(kanonische signierte Payload)`;
   offline gleichzeitig erzeugte Snapshots DÜRFEN dieselbe `seq` tragen,
   der Vergleich bleibt deterministisch, und der nächste Publish nach dem
   Merge korrigiert mit `seq + 1`. `ts` ist reine Anzeigezeit und NICHT
   Teil der Ordnung. Gleiche volle Version = identischer Snapshot =
   idempotenter Wiederempfang; kein Downgrade, kein Replay.
7. Frische ist best-effort: ein Mirror DARF veraltet sein und MUSS in der UI
   als Snapshot erkennbar bleiben (Herkunfts-Space, Stand/Zeitstempel).
8. Löschung propagiert als Tombstone-Snapshot (`item: null`) mit höherer
   `version`. Empfänger MÜSSEN den Mirror-Inhalt entfernen, den Receipt
   aber dauerhaft behalten: pro `(homeSpaceId, itemId)` bleiben höchste
   akzeptierte `version` und Signer-DID gespeichert — sonst ließe sich
   nach dem Tombstone ein älterer, gültig signierter Snapshot wieder
   einspielen (Resurrection). Ein Tombstone löscht Inhalt, nie die
   Versionsmarke — und etabliert nie eine Erst-Bindung (Invariante 5).
9. E2EE-Grenze: die Bridge ist Mitglied beider Spaces und verschlüsselt für
   den Ziel-Space neu; Relay und Nicht-Mitglieder sehen weiterhin nur
   Ciphertext. Ein Mirror macht Inhalte für alle Mitglieder des Ziel-Space
   sichtbar — das ist Teil der Freigabe aus Invariante 3.
10. RelationRecords sind Items ([08-relation-records.md](08-relation-records.md))
    und werden nach denselben Regeln gespiegelt. Ihre Endpunkt-Relations
    bleiben im Snapshot **byte-treu home-relativ**: ein Umschreiben vor
    dem Signieren würde den Item-Inhalt verändern und damit die
    deterministische Relation-`id` aus 08 brechen (sie hasht `from`/`to`).
    Stattdessen gilt eine Auflösungsregel beim Empfänger: relative
    `item:`-Targets eines Mirrors MÜSSEN im Kontext seines `homeSpaceId`
    interpretiert werden (`item:x` ⇒ Mirror-Instanz
    `(targetSpaceId, homeSpaceId, x)`), NIE gegen den lokalen Space.

## Nicht-Ziele

Diese Spec definiert nicht:

- Live-Sync oder CRDT-Merge zwischen Spaces (nur Snapshot-Transfer),
- ein neues Signaturformat (der JWS-Container des WoT wird wiederverwendet),
- automatisches Spiegeln ohne Autor-Freigabe,
- delegiertes Publizieren: ein zielgebundener **MirrorGrant**
  (delegierbare Publisher-Capability, etwa für Schlüsselverlust oder
  abwesende Autoren) ist als spätere Erweiterung vorgesehen, nicht Teil
  dieses Vertrags.
