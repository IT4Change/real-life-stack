# @real-life-stack/supabase-connector

Nativer Supabase-Connector: PostgREST für Queries/Writes, Supabase Realtime
(`postgres_changes`) für live `observe()` — dieselbe Reaktivität wie beim
WoT-Connector. Claim-Modus `authoritative` (Spec 08): das `trusted`-Verdikt
stützt sich auf die serverseitigen RLS-Policies in
`supabase/migrations/0001_rls_schema.sql` (INSERT bindet `created_by` an
`auth.uid()`, ein Trigger macht Identitätsfelder unveränderlich), nicht auf
Client-Code.

## Lokal starten

Voraussetzung: Docker.

```bash
# Im Repo-Root — startet Postgres, PostgREST, GoTrue, Realtime, Studio
npx supabase start
```

`supabase start` gibt `API URL`, `anon key` und `service_role key` aus.
Migrationen aus `supabase/migrations/` werden automatisch angewendet.

### Reference-App dagegen fahren

```bash
cd apps/reference
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<anon key> \
VITE_DEFAULT_CONNECTOR=supabase \
pnpm dev
```

Alternativ per URL-Param: `http://localhost:5173/?connector=supabase&dev`.
v1 meldet sich automatisch anonym an (Session überlebt Reloads); ein echter
Login-Screen (E-Mail/Passwort) ist Folgearbeit.

## Tests

- **Unit-Tests** (`pnpm test`): laufen überall — der echte Connector gegen
  einen In-Memory-Fake des supabase-js-Subsets. Der Fake ist NICHT der
  Schiedsrichter für PostgREST-Semantik, sondern prüft Wiring: Autor-Bindung,
  Mapping, Realtime-Refresh, Relation-Store, Gruppen-Scoping.
- **Live-Contract-Suite** (`tests/data-interface-contract.live.test.ts`):
  die geteilte DataInterface-Contract-Suite plus RLS-Grenztests gegen eine
  echte Instanz. Ohne Env-Variablen skippt sie.

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon key> \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
pnpm --filter @real-life-stack/supabase-connector test
```

## Vertragsgrenzen (dokumentierte Abweichungen)

- `hasField` nutzt `NOT data->key IS NULL`: ein Feld mit explizitem
  JSON-`null` zählt hier als abwesend, während `matchesFilter` (`key in
  data`) es als vorhanden zählt. Feldnamen sind auf `[A-Za-z0-9_-]`
  beschränkt (alles andere wirft — fail closed statt Query-Injection).
- `getAuthMethods`: `anonymous`, `email` (signInWithPassword),
  `email-signup` (signUp, optional `displayName`).
- Fixture-Pfad (`allowFixtureAuthors: true`, für Tests/Tooling mit
  service_role-Key): behält fremde Autoren und VERLIERT dafür
  `verifyRecordClaim` — wie bei Local/Mock.
