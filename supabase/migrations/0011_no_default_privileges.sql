-- Default-Privilegien wieder entziehen — sie machen neue Tabellen fail-open
--
-- 0010 hat `alter default privileges` gesetzt, damit die Rechtevergabe nicht
-- zur handgepflegten Liste verkommt, die beim naechsten `create table` still
-- veraltet. Der Tausch war falsch herum:
--
--   * Vergessene Rechte  -> "permission denied", laut und sofort sichtbar.
--   * Vergessenes RLS    -> Tabelle offen, still und unbemerkt.
--
-- Denn Default-Privilegien vergeben Rechte automatisch, RLS aktiviert sich
-- aber NICHT automatisch. Eine spaeter angelegte Tabelle waere damit bis zur
-- manuellen Haertung fuer jede angemeldete Person les- und schreibbar. Von
-- den beiden Fehlerarten ist die laute die richtige (rls#273 Review).
--
-- Eigene Migration statt Umschreiben von 0010: 0010 ist auf der
-- Produktivinstanz bereits journaled, ein geaenderter Inhalt liefe dort nie.
--
-- Ab hier gilt: Rechte werden GEMEINSAM mit Tabelle, RLS und Policies
-- vergeben — in derselben Migration, die die Tabelle anlegt.

alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated, service_role;

-- Bei `anon` ALLE vier entziehen, nicht nur das select aus 0010: auf
-- Bestandsinstallationen hat die alte Supabase-Konfiguration hier zusaetzlich
-- insert/update/delete als Default hinterlassen (auf der Produktivinstanz
-- nachgesehen). Ein Entzug nur des selbst Vergebenen haette den Altbestand
-- stehen lassen — und damit genau die fail-open-Luecke, die diese Migration
-- schliessen soll.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;

-- Die expliziten Rechte der fuenf bestehenden Tabellen bleiben unberuehrt:
-- sie stehen in 0010 als echte GRANTs, nicht als Default.
