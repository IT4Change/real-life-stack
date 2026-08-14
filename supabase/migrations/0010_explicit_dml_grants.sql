-- DML-Rechte explizit vergeben, statt sie zu erben
--
-- Bis hierher verliess sich der Bootstrap auf implizite Default-Privilegien:
-- aeltere Supabase-Versionen gaben `anon`/`authenticated`/`service_role`
-- automatisch DML auf neue Tabellen in `public`. Neuere tun das NICHT mehr.
-- Auf einer frisch erzeugten Instanz (CLI 2.114) hatten die Rollen deshalb
-- nur REFERENCES/TRIGGER/TRUNCATE — jeder Zugriff scheiterte mit
-- "permission denied for table items", noch bevor eine RLS-Policy zum Zuge
-- kam. Auf der Produktivinstanz faellt es nicht auf, weil dort die alten
-- Defaults gegriffen haben; beim naechsten Neuaufsetzen oder Upgrade schon
-- (rls#271, gefunden beim ersten echten Lauf der Live-Suite fuer rls#263).
--
-- Rechte-Modell: GRANT oeffnet die Tabelle, RLS entscheidet die Zeilen.
-- Beides ist noetig — RLS allein greift nicht ohne GRANT.

-- `authenticated` ist die einzige Rolle, die unsere Policies adressieren
-- (alle Policies sind `to authenticated`). `service_role` umgeht RLS, braucht
-- aber trotzdem Tabellenrechte.
grant select, insert, update, delete
  on table public.profiles, public.groups, public.group_members,
           public.items, public.contacts
  to authenticated, service_role;

-- `anon` bekommt NUR select, und zwar nicht fuer den Datenzugriff: Realtime
-- (WALRUS) prueft die Sichtbarkeit einer Aenderung ueber diese Rolle mit.
-- Ohne das Recht laufen die Realtime-Faelle der Live-Suite in 15s-Timeouts
-- ("realtime update did not arrive") — gemessen, nicht vermutet: erst mit
-- diesem GRANT werden sie gruen.
--
-- Das oeffnet keine Daten. RLS bleibt aktiv, und es gibt KEINE Policy `to
-- anon` — ohne Sitzung passt also keine Zeile, die Abfrage liefert leer.
-- Kein insert/update/delete: dafuer gibt es weder Policy noch Grund.
grant select
  on table public.profiles, public.groups, public.group_members,
           public.items, public.contacts
  to anon;

-- Bestandsinstallationen einfangen: auf aelteren Stacks hat `anon` durch die
-- damaligen Defaults VOLLES DML geerbt (auf der Produktivinstanz nachgesehen:
-- insert/update/delete inklusive). Wirksam war das nie — es gibt keine Policy
-- `to anon`, RLS weist jede Zeile ab —, aber die Flaeche ist unnoetig breit
-- und widerspricht dem, was diese Migration festlegt. Damit alte und neue
-- Instanzen im GLEICHEN Zustand landen, wird der Ueberschuss entzogen.
revoke insert, update, delete
  on table public.profiles, public.groups, public.group_members,
           public.items, public.contacts
  from anon;

-- Kuenftige Tabellen automatisch mitnehmen, damit diese Migration nicht zur
-- handgepflegten Liste verkommt, die beim naechsten `create table` still
-- veraltet. Gilt fuer Tabellen, die von DIESER Rolle (postgres, unter der
-- Migrationen laufen) in `public` erzeugt werden.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;

-- Ausnahme: das Migrationsjournal geht die App nichts an. apply-migrations.sh
-- entzieht die Rechte bereits beim Anlegen; hier noch einmal, damit die
-- Migration unabhaengig von der Reihenfolge zum selben Ergebnis fuehrt.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'schema_migrations_rls') then
    execute 'revoke all on public.schema_migrations_rls from anon, authenticated';
  end if;
end $$;
