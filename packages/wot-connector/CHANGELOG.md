# Changelog

## [0.1.1](https://github.com/real-life-org/real-life-stack/compare/wot-connector-v0.1.0...wot-connector-v0.1.1) (2026-08-06)


### Features

* Generischer AuthScreen — E-Mail-Login/-Registrierung + anonymer Schnellstart ([#240](https://github.com/real-life-org/real-life-stack/issues/240)) ([9181b38](https://github.com/real-life-org/real-life-stack/commit/9181b38c5310a3269b10b857c6933914f251dd48))
* Graph als Space-Modul + sortierbare Modul-Reihenfolge ([#229](https://github.com/real-life-org/real-life-stack/issues/229)) ([684e757](https://github.com/real-life-org/real-life-stack/commit/684e757889465dd9ea7ab76f481ff37068bf13e7))
* Markdown-Rendering und Kommentar-Hinweis in der ItemPreview ([#252](https://github.com/real-life-org/real-life-stack/issues/252)) ([a1f246c](https://github.com/real-life-org/real-life-stack/commit/a1f246c5113182ea16a5cf0d9b5995ce59c26125))
* Nativer Supabase-Connector (Weg B) — PostgREST + Realtime, authoritative Claims ([#238](https://github.com/real-life-org/real-life-stack/issues/238)) ([ebf6756](https://github.com/real-life-org/real-life-stack/commit/ebf675605a3d48701ab9f518e64319f84f3ee0eb))
* Parametrisierte DataInterface-Contract-Suite über alle Connectoren ([#214](https://github.com/real-life-org/real-life-stack/issues/214)) ([#221](https://github.com/real-life-org/real-life-stack/issues/221)) ([82b0de4](https://github.com/real-life-org/real-life-stack/commit/82b0de40cc4e019b2ac618bb839cfcc4caf176ca))
* Resonanz-Modul — Aussagen mit Grün/Gelb/Rot-Stimmen ([#201](https://github.com/real-life-org/real-life-stack/issues/201)) ([5fcf62d](https://github.com/real-life-org/real-life-stack/commit/5fcf62da91988db1a32ef50e11f96d7cfca82bbe))
* SignedClaims-Connector-Wiring — signed WoT, authoritative Local/Mock, fail-closed Aggregation ([#209](https://github.com/real-life-org/real-life-stack/issues/209), PR 2/2) ([#235](https://github.com/real-life-org/real-life-stack/issues/235)) ([90a3545](https://github.com/real-life-org/real-life-stack/commit/90a3545b342410a883e4bd54c57fc338aba2640a))
* Supabase ProfileCapable — Profil befuellen + Avatar (WoT-Paritaet) ([#242](https://github.com/real-life-org/real-life-stack/issues/242)) ([a9d733c](https://github.com/real-life-org/real-life-stack/commit/a9d733c400774eeb0f333aaa97903f7fab1fb381))
* Supabase-Kontakte — Anfrage, Bestaetigung und Profil-Link ([#251](https://github.com/real-life-org/real-life-stack/issues/251)) ([b522781](https://github.com/real-life-org/real-life-stack/commit/b522781df46e36013895c70acf9b401a772aa68f))
* **toolkit:** Verify-Dialog — Restore nach Reload + Countdown mit Auto-Regenerate (1c/3, Teil B) ([#237](https://github.com/real-life-org/real-life-stack/issues/237)) ([cb70e9f](https://github.com/real-life-org/real-life-stack/commit/cb70e9f0d67f5af61c6f3b26e4bb1d2f59882ff4))
* **wot-connector:** durable QR-Challenge — IndexedDB-Capability + Restore-API (1c, Teil A) ([#236](https://github.com/real-life-org/real-life-stack/issues/236)) ([25394a5](https://github.com/real-life-org/real-life-stack/commit/25394a5b745dce463e70de874a8e58459a731720))
* **wot-connector:** stille Empfangs-Drops sichtbar — warn + Debug-Trace ([#226](https://github.com/real-life-org/real-life-stack/issues/226)) ([3064941](https://github.com/real-life-org/real-life-stack/commit/3064941e89c83efa786c6f8ae9219258264006b5))
* **wot-connector:** Trust-002-Zustand durabel — VerificationStateStore verdrahtet ([#222](https://github.com/real-life-org/real-life-stack/issues/222)) ([dea7405](https://github.com/real-life-org/real-life-stack/commit/dea7405f15ca6a9c3c1c6c592678256230336662))


### Bug Fixes

* **wot-connector:** Inner-JWS-Fehlertext beim inbox/1.0-Reject mitloggen ([#217](https://github.com/real-life-org/real-life-stack/issues/217)) ([5c25e24](https://github.com/real-life-org/real-life-stack/commit/5c25e24093067954149e94485f5e02ee7ae58380))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @real-life-stack/data-interface bumped to 0.1.1
    * @real-life-stack/toolkit bumped to 0.1.1
