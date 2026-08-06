-- Runde-1-Review zu rls#251: Die INSERT-Policy prüfte nur requester =
-- auth.uid() — ein Anfragender konnte die Zustimmung komplett umgehen
-- (raw insert mit status 'active' und fremdem addressee_alias). Die
-- Bestätigungs-Verträge gelten jetzt auch am INSERT:
--   * neue Kanten sind IMMER pending
--   * der Alias der Gegenseite ist beim Anlegen leer
--   * Zeitstempel setzt der Server, nie der Client
-- (Forward-Migration: 0004 ist in Produktion bereits journaled.)

drop policy "request as self" on public.contacts;
create policy "request as self"
  on public.contacts for insert to authenticated
  with check (
    requester = (select auth.uid())::text
    and status = 'pending'
    and addressee_alias is null
  );

create function public.contacts_insert_defaults()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger contacts_insert_defaults
  before insert on public.contacts
  for each row execute function public.contacts_insert_defaults();
