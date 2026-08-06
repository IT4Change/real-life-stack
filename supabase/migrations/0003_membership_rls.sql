-- Membership-Sichtbarkeit (WoT-Parität: Space-Inhalte nur für Mitglieder).
--
-- Modell:
--   items:          group_id IS NULL → instanzweit; sonst nur Mitglieder
--                   (lesen UND schreiben — in fremde Gruppen kann niemand
--                   schreiben, auch nicht mit gebundenem created_by)
--   groups:         sichtbar nur für Creator + Mitglieder
--   group_members:  sichtbar für die eigene Zeile + Mitglieder der Gruppe;
--                   EINLADEN nur noch Mitglieder/Creator (vorher: jeder
--                   Authentifizierte — das erlaubte Selbst-Beitritt in
--                   fremde Gruppen und ist hiermit geschlossen)
--   profiles:       bleibt instanzweit lesbar (Mitgliederauswahl beim
--                   Einladen braucht alle Nutzer)
--
-- RLS-Rekursionsfalle (groups-Policy ↔ group_members-Policy): die
-- Mitgliedschafts-Checks laufen als SECURITY DEFINER in einem privaten
-- Schema und lesen group_members/groups ohne RLS — das Standard-Muster.

create schema if not exists private;

create or replace function private.is_group_member(gid text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = (select auth.uid())::text
  )
$$;

create or replace function private.is_group_creator(gid text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.created_by = (select auth.uid())::text
  )
$$;

revoke all on function private.is_group_member(text) from public;
revoke all on function private.is_group_creator(text) from public;
grant execute on function private.is_group_member(text) to authenticated;
grant execute on function private.is_group_creator(text) to authenticated;

-- Membership-Checks laufen pro Row — der Index trägt sie.
create index if not exists group_members_user_idx
  on public.group_members (user_id, group_id);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

drop policy "items readable by authenticated" on public.items;
create policy "items readable in own scope"
  on public.items for select to authenticated
  using (group_id is null or private.is_group_member(group_id));

drop policy "create item as self" on public.items;
create policy "create item as self in own scope"
  on public.items for insert to authenticated
  with check (
    created_by = (select auth.uid())::text
    and (group_id is null or private.is_group_member(group_id))
  );

drop policy "edit item" on public.items;
create policy "edit item"
  on public.items for update to authenticated
  using (
    (group_id is null or private.is_group_member(group_id))
    and (type <> 'relation' or created_by = (select auth.uid())::text)
  )
  with check (
    (group_id is null or private.is_group_member(group_id))
    and (type <> 'relation' or created_by = (select auth.uid())::text)
  );

drop policy "delete item" on public.items;
create policy "delete item"
  on public.items for delete to authenticated
  using (
    (group_id is null or private.is_group_member(group_id))
    and (type <> 'relation' or created_by = (select auth.uid())::text)
  );

-- Scope-Wechsel ist KEIN Update: sonst könnte ein Mitglied ein Gruppen-Item
-- global veröffentlichen (group_id → NULL) oder in einen anderen eigenen
-- Space verschieben. Die UPDATE-Policy allein reicht nicht, weil sie alten
-- und neuen Scope nur getrennt prüft.
create function public.enforce_item_scope_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.group_id is distinct from old.group_id then
    raise exception 'group_id is immutable — ein Item wechselt seinen Space nicht';
  end if;
  return new;
end;
$$;

create trigger items_scope_immutable
  before update on public.items
  for each row execute function public.enforce_item_scope_immutable();

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

drop policy "groups readable by authenticated" on public.groups;
create policy "groups readable by members"
  on public.groups for select to authenticated
  using (
    created_by = (select auth.uid())::text
    or private.is_group_member(id)
  );

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------

drop policy "memberships readable by authenticated" on public.group_members;
create policy "memberships readable by group members"
  on public.group_members for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or private.is_group_member(group_id)
  );

drop policy "any member invites" on public.group_members;
-- WoT-Semantik: alle MITGLIEDER laden ein; der Creator braucht den
-- Creator-Zweig für seine eigene erste Mitgliedschaft (createGroup fügt
-- ihn direkt nach dem Anlegen hinzu).
create policy "members invite"
  on public.group_members for insert to authenticated
  with check (
    private.is_group_member(group_id)
    or private.is_group_creator(group_id)
  );

drop policy "self-leave or creator removes" on public.group_members;
create policy "self-leave or creator removes"
  on public.group_members for delete to authenticated
  using (
    user_id = (select auth.uid())::text
    or private.is_group_creator(group_id)
  );
