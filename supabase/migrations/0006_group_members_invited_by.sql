-- Sichtbare Zustellung von Gruppen-Einladungen (rls#251): das
-- space-invite-Event braucht den EINLADENDEN. Der Server stempelt ihn —
-- der Client kann ihn weder setzen noch fälschen.

alter table public.group_members
  add column invited_by text default (auth.uid())::text;

create function public.group_members_stamp_inviter()
returns trigger
language plpgsql
as $$
begin
  -- Immer der tatsächliche Aufrufer; service_role (kein auth.uid) lässt
  -- einen explizit gesetzten Wert stehen (Fixtures/Tooling).
  if (select auth.uid()) is not null then
    new.invited_by := (select auth.uid())::text;
  end if;
  return new;
end;
$$;

create trigger group_members_stamp_inviter
  before insert on public.group_members
  for each row execute function public.group_members_stamp_inviter();
