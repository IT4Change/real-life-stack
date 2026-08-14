-- Fremde Kommentare und Reaktionen sind unantastbar
--
-- 0003 nahm nur `relation` aus (damit niemand eine fremde Stimme aendert).
-- `comment` und `reaction` tragen dieselbe Eigenschaft: sie sind eine
-- sichtbare Aussage EINER Person. Einen fremden Kommentar zu aendern hiesse,
-- jemandem Worte in den Mund zu legen.
--
-- Die UI blendet die Knoepfe bereits aus — aber die UI ist keine Grenze
-- (rls#263 Review). Hier ist sie eine: PostgREST kommt an dieser Policy
-- nicht vorbei.
--
-- Gewoehnliche Inhalts-Items bleiben fuer alle Mitglieder bearbeitbar; das
-- ist der Zweck von rls#263 und aendert sich hier nicht.

drop policy if exists "edit item" on public.items;
create policy "edit item"
  on public.items for update to authenticated
  using (
    (group_id is null or private.is_group_member(group_id))
    and (type not in ('relation', 'comment', 'reaction')
         or created_by = (select auth.uid())::text)
  )
  with check (
    (group_id is null or private.is_group_member(group_id))
    and (type not in ('relation', 'comment', 'reaction')
         or created_by = (select auth.uid())::text)
  );

drop policy if exists "delete item" on public.items;
create policy "delete item"
  on public.items for delete to authenticated
  using (
    (group_id is null or private.is_group_member(group_id))
    and (type not in ('relation', 'comment', 'reaction')
         or created_by = (select auth.uid())::text)
  );
