-- Bearbeitungsstempel: updated_at / updated_by
--
-- Space-Mitglieder duerfen einander Items bearbeiten (Policy "edit item" aus
-- 0003 laesst das laengst zu). Ohne Stempel steht danach weiterhin nur der
-- urspruengliche Autor unter dem Item — die Aenderung ist unsichtbar.
--
-- Gesetzt wird SERVERSEITIG per Trigger, nicht vom Client. Derselbe Grund wie
-- bei created_by (0001 + Immutability-Trigger): wer den Bearbeiter benennen
-- darf, darf auch jemand anderen benennen. Der Trigger ueberschreibt daher
-- unbedingt, egal was im UPDATE steht.
--
-- Bewusst KEINE Historie: das waere eine eigene Tabelle mit eigener
-- RLS-Spiegelung und Aufbewahrungsfrage (rls#263).

alter table public.items
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

create or replace function private.stamp_item_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid())::text;
  return new;
end;
$$;

drop trigger if exists items_stamp_update on public.items;
create trigger items_stamp_update
  before update on public.items
  for each row
  execute function private.stamp_item_update();
