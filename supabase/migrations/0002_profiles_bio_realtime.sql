-- ProfileCapable für den Supabase-Connector: Bio-Feld + Live-Profile.
-- Avatare bleiben base64-Data-URLs in avatar_url (200px, wie beim
-- WoT-Connector) — kein Storage-Dienst nötig.

alter table public.profiles add column if not exists bio text;

-- Realtime für Profiländerungen (observeMyProfile über Geräte hinweg,
-- Mitgliederlisten-Namen bleiben frisch).
alter table public.profiles replica identity full;
alter publication supabase_realtime add table public.profiles;
