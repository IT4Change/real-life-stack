-- GoTrue's own migrations `create or replace` the auth helper functions
-- (uid/role/email/jwt). The image creates uid/role/email owned by postgres,
-- while GoTrue connects as supabase_auth_admin → "must be owner of function
-- uid" crash-loop on first start. Hand the helpers to supabase_auth_admin
-- up front; `create or replace` keeps the existing ACLs (PUBLIC execute).
do $$
declare fn text;
begin
  foreach fn in array array['auth.uid()', 'auth.role()', 'auth.email()', 'auth.jwt()'] loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s owner to supabase_auth_admin', fn);
    end if;
  end loop;
end
$$;
