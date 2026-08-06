-- Forward-Migration für die PRODUKTIVE Instanz (rls#246 Review):
-- 0001 und 0003 sind dort bereits journalisiert, ihre Korrekturen greifen
-- nur bei frischen Installationen. Diese Migration zieht beide Härtungen
-- auf dem laufenden Server nach.
--
-- 1) group_id ist unveränderlich — sonst kann ein Mitglied ein Gruppen-Item
--    global veröffentlichen (group_id → NULL) oder in einen anderen eigenen
--    Space verschieben. Die UPDATE-Policy prüft alten und neuen Scope nur
--    getrennt und deckt das nicht ab.
-- 2) Der Fremdschlüssel stand auf ON DELETE SET NULL: das Löschen einer
--    Gruppe hätte deren Inhalte instanzweit sichtbar gemacht — Löschen
--    wäre Veröffentlichen. Jetzt CASCADE: die Gruppe nimmt ihre Inhalte mit.

create or replace function public.enforce_item_scope_immutable()
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

drop trigger if exists items_scope_immutable on public.items;
create trigger items_scope_immutable
  before update on public.items
  for each row execute function public.enforce_item_scope_immutable();

do $$
declare fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.items'::regclass
    and contype = 'f'
    and confrelid = 'public.groups'::regclass;
  if fk_name is not null then
    execute format('alter table public.items drop constraint %I', fk_name);
  end if;
end
$$;

alter table public.items
  add constraint items_group_id_fkey
  foreign key (group_id) references public.groups (id) on delete cascade;
