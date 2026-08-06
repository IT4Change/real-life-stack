-- Kontakte (Freundesliste) für den Supabase-Connector: Anfrage → Bestätigung.
--
-- Modell (serverseitiges Äquivalent der WoT-Verifikation, authoritative):
--   addContact(B) durch A  → Kante (A→B, pending)
--   Bestätigung durch B    → status active (NUR der Angefragte kann das —
--                            der Anfragende kann seine Anfrage nicht selbst
--                            "beidseitig" machen)
--   Gegenanfrage von B     → zählt als Bestätigung (App-seitig)
--   Sichtbar ist die Kante NUR für die zwei Beteiligten.
--   Aliase: jede Seite pflegt ihren eigenen Anzeigenamen für die andere.

create table public.contacts (
  requester text not null,
  addressee text not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  requester_alias text,
  addressee_alias text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- Eine Kante pro Paar, egal in welcher Richtung sie entstand.
create unique index contacts_pair_idx
  on public.contacts (least(requester, addressee), greatest(requester, addressee));
create index contacts_addressee_idx on public.contacts (addressee);

alter table public.contacts enable row level security;

create policy "contacts visible to participants"
  on public.contacts for select to authenticated
  using (requester = (select auth.uid())::text or addressee = (select auth.uid())::text);

create policy "request as self"
  on public.contacts for insert to authenticated
  with check (requester = (select auth.uid())::text);

create policy "participants update their edge"
  on public.contacts for update to authenticated
  using (requester = (select auth.uid())::text or addressee = (select auth.uid())::text)
  with check (requester = (select auth.uid())::text or addressee = (select auth.uid())::text);

create policy "participants remove their edge"
  on public.contacts for delete to authenticated
  using (requester = (select auth.uid())::text or addressee = (select auth.uid())::text);

-- Spalten-Ownership, die Policies nicht ausdrücken können:
-- Identität/Zeit immutabel; pending→active NUR durch den Angefragten;
-- Aliase nur in der je eigenen Spalte.
create function public.enforce_contact_rules()
returns trigger
language plpgsql
as $$
declare
  caller text := (select auth.uid())::text;
begin
  if new.requester is distinct from old.requester
    or new.addressee is distinct from old.addressee
    or new.created_at is distinct from old.created_at then
    raise exception 'requester, addressee and created_at are immutable';
  end if;
  if new.status is distinct from old.status then
    if not (old.status = 'pending' and new.status = 'active') then
      raise exception 'only pending -> active is a valid status transition';
    end if;
    -- service_role (Migrations/Tooling) hat kein auth.uid und darf.
    if caller is not null and caller <> old.addressee then
      raise exception 'only the addressee confirms a contact request';
    end if;
  end if;
  if caller is not null then
    if new.requester_alias is distinct from old.requester_alias and caller <> old.requester then
      raise exception 'only the requester edits requester_alias';
    end if;
    if new.addressee_alias is distinct from old.addressee_alias and caller <> old.addressee then
      raise exception 'only the addressee edits addressee_alias';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger contacts_rules
  before update on public.contacts
  for each row execute function public.enforce_contact_rules();

-- Realtime: Kontaktlisten beider Seiten bleiben live (WALRUS filtert über
-- die select-Policy — jede Seite bekommt nur die eigenen Kanten).
alter table public.contacts replica identity full;
alter publication supabase_realtime add table public.contacts;
