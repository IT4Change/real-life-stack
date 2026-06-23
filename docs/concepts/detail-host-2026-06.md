# Host-eigener Detail-Host: Read + Edit + Pick (Juni 2026)

**Status:** Vorschlag (2026-06-23), Architektur + Pick-UX mit Anton entschieden
**Scope:** Phase-2-Scheibe 1. Löst den Code-Smell und den Karten-UX-Regress aus der Edit/Delete-Reihe (PR #128–#131 gemerged; #132 „Map-Pick aus Edit" bewusst geschlossen).
**Bezug:** [./item-edit-delete-2026-06.md](./item-edit-delete-2026-06.md) (Phase 1, Typ-Registry-Leitidee), [../spec/01-app-composition.md](../spec/01-app-composition.md) (Routing, ModulePanel), [../spec/modules/shared-components.md](../spec/modules/shared-components.md) (`ItemDetailView`, `ContentComposer`).

Entscheidungen werden **inline** in den o.g. Spec-Docs verankert (kein ADR), mit den jeweiligen PRs.

## 1. Warum

Phase 1 hat Edit/Delete in alle Module gebracht, aber mit einer **Asymmetrie**: **Read** wird fokus-getrieben pro Modul geöffnet (`openDetail` → `ItemDetailView` → ModulePanel) und **remountet** beim Modulwechsel; der **Edit**-Composer (und der Map-Pick) wollte host-eigen + persistent sein. Das Überbrücken dieses Lebenszyklus-Splits erzeugte beim Map-Pick-Versuch (#132) Adopt-Guard, One-Shot-Signal, Reveal-Gate und `returnOnConfirm` — plus einen UX-Regress auf der Karte (zwei Marker, „Fertig"-Zwang, Positions-Sprung beim Speichern).

**Wurzel:** die Asymmetrie. **Read und Edit gehören demselben Besitzer.**

## 2. Entscheidung

**Ein host-eigener Detail-Host besitzt die *ganze* Detailansicht — Read, Edit und Pick — für das Fokus-Item, oberhalb des Outlets.** Module rufen kein `openDetail` mehr; sie setzen nur den **Fokus** (itemId in der URL), der Host materialisiert die Detailansicht und hält sie über Modulwechsel persistent.

Damit verschwindet der Split an der Wurzel: kein Adopt-Guard, kein One-Shot-Signal, kein Reveal-Gate, kein `returnOnConfirm`. Der Composer überlebt den Karten-Roundtrip, weil er host-eigen ist.

### 2.1 State: Host als Single Source of Truth

| State | Wo | Warum |
|---|---|---|
| **Fokus-Item** (welches Item offen) | **URL** (`/{scope}/{module}/{itemId}`) | navigatorisch, teilbar, back-stackable — wie heute |
| **Read↔Edit-Modus** | **Host** | transienter Interaktions-Modus, **co-located** mit der Edit-Session |
| **Pick-Modus + Origin** | **Host** | Teil der Edit-Session |
| **In-Flight-Composer-Daten** (Text, Pending-Position) | **Host** (In-Memory) | unsaved Formulardaten gehören nirgends sonst hin |

Der Edit-/Pick-**Modus** liegt bewusst **nicht** in der URL: Edit-Flag in der URL + Edit-Daten im Host wären zwei Quellen, die man synchron halten muss. Co-Locating im Host = **eine** Wahrheit. Die URL trägt nur die navigatorische Wahrheit (Fokus + Modul).

**Optional später:** Der Host kann ein `?edit` in die URL *spiegeln* (Host bleibt Truth) — nur falls Browser-Zurück Edit→Read oder teilbare Edit-Links gewünscht sind. Nicht im Lastpfad.

### 2.2 Read ist typ-getrieben (der Haken)

Host-eigenes Read braucht die Detail-Darstellung **pro Item**. Heute rendert jedes Modul sein eigenes `ItemPreview` mit Modul-Adornments (Kalender: Zeitspanne, Karte: Meta, Feed: Reaktionen). Die sind aber **typ**-getrieben (ein Event zeigt seine Zeit, egal aus welchem Modul geöffnet) → genau das **Typ-Registry** ([item-edit-delete-2026-06.md](./item-edit-delete-2026-06.md) §2).

**Inkrementeller Zwischenschritt** (ohne das Registry vorzubauen): das Modul **registriert** seine Detail-Config (Read-Render-Funktion + Edit-Config: Widgets/Mapper/Vorfüllung) beim Host, statt sie via `openDetail` zu setzen. Der Host rendert Read oder Edit daraus + seinem eigenen Modus-State. Die Vereinheitlichung auf das typ-gekeyte Registry folgt in Scheibe 2/3.

## 3. Live-Preview-Pick

Picken passiert auf der **echten Karte** (Entscheidung mit Anton: Reuse statt Overlay — echte Marker, Snap, Pan/Zoom/Globe). Feed/Kalender **navigieren** zum Karten-Modul; beim Karten-Item kein Wechsel (in-place).

- Während Pick rendert die Karte das Item mit seiner **Pending-Position** (aus dem Host-Composer-State), nicht aus den gespeicherten Daten. **Ein** Marker, der sich live mitbewegt — kein zweiter Pick-Marker.
- Kartentipp setzt die Pending-Position (Snap auf bestehende Marker bleibt). Kein „Fertig"-Zwang: „Übernehmen" kehrt zum Origin-Modul zurück (Composer wieder im Bild), beim Karten-Item reicht Speichern.
- Kein Sprung beim Speichern: der Marker stand schon an der neuen Position; Speichern persistiert sie nur.

Der Host weiß „editiere Item X, Origin = Feed", weil er die Session besitzt — die Karte liest Pick-Modus + Pending-Position aus dem Host, der Rücksprung braucht kein URL-`from`.

## 4. Supersedes

- [item-edit-delete-2026-06.md](./item-edit-delete-2026-06.md) §3.1 „Read↔Edit ist ein interner Zustand des Hosts (kein Routing)" — bleibt im Geist richtig (kein Routing fürs Edit), aber der **Host** ist jetzt der app-weite Detail-Host oberhalb des Outlets, nicht ein per-Modul gemountetes `ItemDetailView`.

## 5. PR-Schnitt (Scheibe 1)

1. **Host-eigener Detail-Host (Read + Edit).** Die ganze Detailansicht zieht aus den per-Modul-`openDetail`-Aufrufen in einen Host oberhalb des Outlets, fokus-getrieben aus der URL. Module registrieren ihre Detail-Config (Read-Render + Edit-Config). Read↔Edit + Delete als Host-State. Pick bleibt vorerst aus (Edit-Location nur per Adress-geocode, wie heute). Verifiziert: Read/Edit/Delete/Cancel in allen vier Modulen, persistent über Modulwechsel.
2. **Live-Preview-Pick auf der echten Karte.** Host koordiniert Navigation zur Karte (bzw. in-place beim Karten-Item), ein Marker, Live-Preview, „Übernehmen" zurück zum Origin.

## 6. Danach (eigene Scheiben)

- **Scheibe 2:** Kanban auf den Host (Detail-Config dann typ-gekeyt; task-spezifische Felder wie Personen-Zuweisung).
- **Scheibe 3:** Templates + Typ-Konversion + Pflichtfelder (`requiredFields` am Typ-Registry, Submit-Gate, Feld-Übernahme beim Wechsel).
