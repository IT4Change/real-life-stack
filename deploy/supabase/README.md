# Supabase self-hosted — Timos NixOS-Server

Schlanker Supabase-Stack für den `@real-life-stack/supabase-connector`
(db + GoTrue + PostgREST + Realtime + Kong; kein Studio/Analytics/Storage).
Reduziert aus dem offiziellen [supabase/docker](https://github.com/supabase/supabase/tree/master/docker)-Setup
(Apache-2.0), Versionen gepinnt, kein Watchtower (DB-Major-Auto-Update wäre
Datenverlust).

- **Domain:** `supabase.real-life-stack.de` → A-Record auf `85.214.196.122`
- **Server-Pfad:** `/home/timo/apps/supabase/`
- **TLS:** Traefik/Let's Encrypt (Label auf dem Kong-Container)

## Erst-Setup (einmalig)

```bash
# 1. Dateien auf den Server (vom Repo-Root):
scp -r deploy/supabase root@85.214.196.122:/home/timo/apps/
scp -r supabase/migrations root@85.214.196.122:/home/timo/apps/supabase/

# 2. Auf dem Server:
cd /home/timo/apps/supabase
./generate-secrets.sh        # .env (chmod 600) + Traefik ↔ supabase-Netz; gibt NUR den ANON_KEY aus
docker compose up -d
./apply-migrations.sh        # wartet auf GoTrue, wendet supabase/migrations/*.sql an (journaled)
```

## Architektur-Notizen

- **Eigenes `supabase`-Netz:** Der Stack braucht Inter-Container-DNS; das
  server-übliche `network_mode: bridge` hat keins. Traefik wird per
  `docker network connect supabase traefik` verbunden (macht
  `generate-secrets.sh` idempotent). ⚠️ Wird der Traefik-Container neu
  ERSTELLT (nicht nur neu gestartet), ist die Verbindung weg →
  `generate-secrets.sh` erneut ausführen. Sauberer Fix: Netz-Join im
  infrastructure-Repo verankern (offen).
- **Secrets:** liegen nur in `.env` auf dem Server (600). Der ANON_KEY ist
  public by design (steht im Frontend-Bundle). SERVICE_ROLE_KEY und
  JWT_SECRET niemals herausgeben; Key-Rotation = `.env` löschen +
  `generate-secrets.sh` + `docker compose up -d` (invalidiert alle Sessions).
- **GoTrue ohne SMTP:** `MAILER_AUTOCONFIRM=true` — E-Mail-Signups sind
  sofort bestätigt. Anonyme Logins sind aktiv (Connector-v1).
- **Admin-Zugriff:** `docker exec -it supabase-db psql -U postgres` (kein
  Studio deployed).

## Sichtbarkeitsmodell (seit Migration 0003)

- **items:** `group_id IS NULL` → instanzweit sichtbar; Gruppen-Items nur
  für Mitglieder (lesen UND schreiben)
- **groups / group_members:** nur Creator + Mitglieder; **einladen dürfen
  nur Mitglieder** (der frühere Selbst-Beitritt Beliebiger ist zu)
- **profiles:** instanzweit lesbar (Mitgliederauswahl beim Einladen)
- Mitgliedschafts-Checks als `security definer`-Funktionen im
  `private`-Schema (Standard-Muster gegen die RLS-Rekursionsfalle
  groups ↔ group_members); Realtime (WALRUS) wertet dieselben Policies aus

## Smoke-Tests

```bash
curl -s https://supabase.real-life-stack.de/auth/v1/health   # GoTrue-Version
# PostgREST mit anon key (aus generate-secrets.sh):
curl -s "https://supabase.real-life-stack.de/rest/v1/items?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# → [] oder 200 mit Daten; ohne apikey → 401 (Kong key-auth)
```

## Live-Contract-Suite dagegen fahren

```bash
SUPABASE_URL=https://supabase.real-life-stack.de \
SUPABASE_ANON_KEY=<anon key> \
SUPABASE_SERVICE_ROLE_KEY=<service_role key aus .env auf dem Server> \
pnpm --filter @real-life-stack/supabase-connector test
```

## Vertrag: Space-Zugehörigkeit und Gruppen-Löschung (seit 0007)

- **`items.group_id` ist unveränderlich** (Trigger `items_scope_immutable`).
  Ein Item wechselt seinen Space nicht — weder global→Gruppe noch
  Gruppe→global noch zwischen Gruppen. Die UPDATE-Policy allein reicht
  dafür nicht, weil sie alten und neuen Scope nur getrennt prüft. Ein
  fachlich gewollter Space-Wechsel wäre eine eigene autorisierte Operation.
- **Gruppen-Löschung kaskadiert** (`on delete cascade`): Die Gruppe nimmt
  ihre Inhalte mit. Vorher stand der Fremdschlüssel auf `set null` — dann
  wären die Items instanzweit sichtbar geworden, Löschen wäre
  Veröffentlichen gewesen. Wer Archivierung/Wiederherstellung will, braucht
  `restrict` plus expliziten Löschworkflow (eigener Feature-Schnitt).

## Neue Migrationen ausrollen

Neue Datei in `supabase/migrations/` → per scp in
`/home/timo/apps/supabase/migrations/` → `./apply-migrations.sh` (skippt
bereits angewendete Dateien über die Journal-Tabelle
`schema_migrations_rls`, die nicht über die API erreichbar ist).
