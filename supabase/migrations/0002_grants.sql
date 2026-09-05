-- Grant base privileges for PostgREST roles
-- Supabase's anon/authenticated/service_role need explicit grants;
-- RLS policies still enforce access rules on top of these grants.

grant usage on schema public to anon, authenticated, service_role;

-- Read access (RLS still applies where enabled)
grant select on all tables in schema public to anon, authenticated, service_role;

-- Write access for service_role (bypasses RLS anyway)
grant insert, update, delete on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- Default privileges for future tables added later
alter default privileges in schema public
  grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage on sequences to service_role;
