-- PHASE 3: Supporting function for Supabase Auth user management.
-- Additive only: this script does not delete the legacy password column or existing data.

begin;

create sequence if not exists public.oms_user_seq;

do $$
declare
    current_max bigint;
begin
    select coalesce(max((regexp_match(id, '^USER-([0-9]+)$'))[1]::bigint), 0)
    into current_max
    from public.users
    where id ~ '^USER-[0-9]+$';

    if current_max > 0 then
        perform setval('public.oms_user_seq', current_max, true);
    else
        perform setval('public.oms_user_seq', 1, false);
    end if;
end $$;

create or replace function public.oms_next_user_id()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
    select 'USER-' || lpad(nextval('public.oms_user_seq')::text, 3, '0')
$$;

revoke all on function public.oms_next_user_id() from public, anon, authenticated;
grant execute on function public.oms_next_user_id() to service_role;

-- Do not expand table privileges in this migration. Supabase normally grants
-- these to service_role already; fail safely if a project has narrowed them.
do $$
begin
    if not has_table_privilege('service_role', 'public.users', 'select')
       or not has_table_privilege('service_role', 'public.users', 'insert')
       or not has_table_privilege('service_role', 'public.users', 'update') then
        raise exception 'service_role must already have SELECT, INSERT and UPDATE on public.users';
    end if;
end $$;

comment on function public.oms_next_user_id() is
    'Allocates a collision-safe OMS profile id for the trusted admin-user Edge Function.';

commit;
