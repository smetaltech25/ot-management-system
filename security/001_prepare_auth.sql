-- PHASE 1: Additive preparation only.
-- Run on Staging first. This script DOES NOT enable RLS and DOES NOT remove passwords.

begin;

alter table public.users
    add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_uidx
    on public.users (auth_user_id)
    where auth_user_id is not null;

comment on column public.users.auth_user_id is
    'Links the employee profile to auth.users.id. Must be populated before RLS cutover.';

-- Safe directory for approver pickers, calendar and reports.
-- Never add password or other secrets to this view.
create or replace view public.user_directory
with (security_invoker = true)
as
select
    id,
    auth_user_id,
    username,
    employee_id,
    fullname,
    avatar_url,
    agency,
    department,
    role,
    status
from public.users;

comment on view public.user_directory is
    'Non-secret employee fields for authenticated application screens.';

commit;

-- PRE-CUTOVER AUDIT: both counts must be zero before enabling RLS.
select count(*) as active_users_without_auth
from public.users
where status is true and auth_user_id is null;

select auth_user_id, count(*) as duplicate_count
from public.users
where auth_user_id is not null
group by auth_user_id
having count(*) > 1;

