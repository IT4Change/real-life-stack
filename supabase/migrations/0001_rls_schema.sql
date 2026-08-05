-- Real-Life-Stack schema for the native Supabase connector.
--
-- Security contract (docs/spec/08-relation-records.md → authoritative mode):
-- the connector answers "trusted" for record claims, which it may ONLY do
-- when every server ingress binds created_by to the authenticated identity.
-- That binding lives HERE — in the insert policies and the immutability
-- trigger — not in client code. Client-side stamping is convenience; these
-- policies are the boundary.

-- ---------------------------------------------------------------------------
-- profiles — public user info, one row per auth user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

create policy "insert own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Auto-create the profile row on signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

create table public.groups (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text not null default (auth.uid())::text,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create policy "groups readable by authenticated"
  on public.groups for select to authenticated using (true);

-- Ingress binding: a group is always created in the caller's name.
create policy "create group as self"
  on public.groups for insert to authenticated
  with check (created_by = (select auth.uid())::text);

create policy "creator updates group"
  on public.groups for update to authenticated
  using (created_by = (select auth.uid())::text)
  with check (created_by = (select auth.uid())::text);

create policy "creator deletes group"
  on public.groups for delete to authenticated
  using (created_by = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- group_members — membership model mirrors WoT: everyone invites,
-- only the creator removes (plus self-leave)
-- ---------------------------------------------------------------------------

create table public.group_members (
  group_id text not null references public.groups (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "memberships readable by authenticated"
  on public.group_members for select to authenticated using (true);

create policy "any member invites"
  on public.group_members for insert to authenticated
  with check (true);

create policy "self-leave or creator removes"
  on public.group_members for delete to authenticated
  using (
    user_id = (select auth.uid())::text
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = (select auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- items — the generic Item store (data/relations/tags/@context as in
-- docs/spec/02-data-interface.md; relation records are items of type
-- 'relation' per docs/spec/08-relation-records.md)
-- ---------------------------------------------------------------------------

create table public.items (
  id text primary key,
  type text not null,
  created_by text not null default (auth.uid())::text,
  created_at timestamptz not null default now(),
  context text[],
  schema text,
  schema_version integer,
  data jsonb not null default '{}'::jsonb,
  relations jsonb,
  tags text[],
  group_id text references public.groups (id) on delete set null
);

create index items_type_idx on public.items (type);
create index items_created_by_idx on public.items (created_by);
create index items_group_idx on public.items (group_id);
create index items_tags_idx on public.items using gin (tags);
create index items_context_idx on public.items using gin (context);
create index items_relations_idx on public.items using gin (relations jsonb_path_ops);

alter table public.items enable row level security;

create policy "items readable by authenticated"
  on public.items for select to authenticated using (true);

-- THE ingress binding for the authoritative claim mode: nobody can insert
-- an item in someone else's name, relation records included.
create policy "create item as self"
  on public.items for insert to authenticated
  with check (created_by = (select auth.uid())::text);

-- Plain items are collaborative (any member edits); relation records are
-- author-only — a vote's CONTENT is as identity-bound as its authorship.
create policy "edit item"
  on public.items for update to authenticated
  using (type <> 'relation' or created_by = (select auth.uid())::text)
  with check (type <> 'relation' or created_by = (select auth.uid())::text);

create policy "delete item"
  on public.items for delete to authenticated
  using (type <> 'relation' or created_by = (select auth.uid())::text);

-- Identity fields never change after creation — this also closes the
-- "update forges created_by" path for every role that runs DML.
create function public.enforce_item_immutables()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.type is distinct from old.type
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'id, type, created_by and created_at are immutable';
  end if;
  return new;
end;
$$;

create trigger items_immutables
  before update on public.items
  for each row execute function public.enforce_item_immutables();

-- ---------------------------------------------------------------------------
-- realtime — the connector's observe() reactivity rides on postgres_changes
-- ---------------------------------------------------------------------------

-- Full replica identity so UPDATE/DELETE events carry the old row (the
-- connector needs the id to know which observables to refresh).
alter table public.items replica identity full;
alter table public.groups replica identity full;
alter table public.group_members replica identity full;

alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
