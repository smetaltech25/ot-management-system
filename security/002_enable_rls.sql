-- PHASE 2: RLS cutover draft.
-- Preconditions are documented in README.md. Run on Staging first.
-- This intentionally blocks anon access and therefore is NOT compatible with the old login.

begin;

do $$
begin
    if exists (
        select 1 from public.users
        where status is true and auth_user_id is null
    ) then
        raise exception 'RLS cutover blocked: active users without auth_user_id exist';
    end if;
end $$;

create or replace function public.oms_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select u.id
    from public.users u
    where u.auth_user_id = auth.uid() and u.status is true
    limit 1
$$;

create or replace function public.oms_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select u.role
    from public.users u
    where u.auth_user_id = auth.uid() and u.status is true
    limit 1
$$;

create or replace function public.oms_is_privileged()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.oms_role() in ('SuperUser', 'Admin', 'SuperAdmin'), false)
$$;

create or replace function public.oms_can_review_request(target_request_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.approval_steps s
        where s.request_id = target_request_id
          and s.approver_id = public.oms_user_id()
    )
$$;

create or replace function public.oms_can_access_request(target_request_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.ot_requests r
        where r.id = target_request_id
          and (
              r.user_id = public.oms_user_id()
              or public.oms_is_privileged()
              or public.oms_can_review_request(r.id)
          )
    )
$$;

create or replace function public.oms_is_request_owner(target_request_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.ot_requests r
        where r.id = target_request_id
          and r.user_id = public.oms_user_id()
    )
$$;

create or replace function public.oms_can_insert_step(target_request_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.ot_requests r
        where r.id = target_request_id
          and r.user_id = public.oms_user_id()
          and r.status = 'Pending'
    )
$$;

create or replace function public.oms_can_delete_request(target_request_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.ot_requests r
        where r.id = target_request_id
          and r.user_id = public.oms_user_id()
          and r.status = 'Pending'
          and not exists (
              select 1
              from public.approval_steps s
              where s.request_id = r.id and s.status <> 'Pending'
          )
    )
$$;

create or replace function public.oms_can_act_step(target_step_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.approval_steps s
        where s.id = target_step_id
          and s.approver_id = public.oms_user_id()
          and s.status = 'Pending'
          and not exists (
              select 1
              from public.approval_steps previous_step
              where previous_step.request_id = s.request_id
                and previous_step.step_order < s.step_order
                and previous_step.status <> 'Approved'
          )
    )
$$;

create or replace function public.oms_review_steps(
    target_step_ids text[],
    target_action text,
    target_comment text
)
returns table(step_id text, request_id text, step_status text, request_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_count integer;
    allowed_count integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if target_action not in ('Approved', 'Rejected') then
        raise exception 'Invalid review action';
    end if;

    if coalesce(cardinality(target_step_ids), 0) = 0 then
        raise exception 'No approval steps selected';
    end if;

    if nullif(btrim(target_comment), '') is null then
        raise exception 'Review comment is required';
    end if;

    select cardinality(target_step_ids), count(*)
    into target_count, allowed_count
    from public.approval_steps s
    where s.id = any(target_step_ids)
      and public.oms_can_act_step(s.id);

    if allowed_count <> target_count then
        raise exception 'One or more approval steps are missing, not assigned, or not ready';
    end if;

    update public.approval_steps s
    set status = target_action,
        approved_at = to_char(timezone('Asia/Bangkok', now()), 'DD/MM/YYYY : HH24:MI'),
        comment = btrim(target_comment)
    where s.id = any(target_step_ids);

    if target_action = 'Rejected' then
        update public.ot_requests r
        set status = 'Rejected'
        where r.id in (
            select distinct s.request_id
            from public.approval_steps s
            where s.id = any(target_step_ids)
        );
    else
        update public.ot_requests r
        set status = 'Approved'
        where r.id in (
            select distinct s.request_id
            from public.approval_steps s
            where s.id = any(target_step_ids)
        )
          and not exists (
              select 1
              from public.approval_steps remaining
              where remaining.request_id = r.id
                and remaining.status <> 'Approved'
          );
    end if;

    return query
    select s.id, s.request_id, s.status, r.status
    from public.approval_steps s
    join public.ot_requests r on r.id = s.request_id
    where s.id = any(target_step_ids);
end;
$$;

revoke all on function public.oms_user_id() from public, anon;
revoke all on function public.oms_role() from public, anon;
revoke all on function public.oms_is_privileged() from public, anon;
revoke all on function public.oms_can_review_request(text) from public, anon;
revoke all on function public.oms_can_access_request(text) from public, anon;
revoke all on function public.oms_is_request_owner(text) from public, anon;
revoke all on function public.oms_can_insert_step(text) from public, anon;
revoke all on function public.oms_can_delete_request(text) from public, anon;
revoke all on function public.oms_can_act_step(text) from public, anon;
revoke all on function public.oms_review_steps(text[], text, text) from public, anon;
grant execute on function public.oms_user_id() to authenticated;
grant execute on function public.oms_role() to authenticated;
grant execute on function public.oms_is_privileged() to authenticated;
grant execute on function public.oms_can_review_request(text) to authenticated;
grant execute on function public.oms_can_access_request(text) to authenticated;
grant execute on function public.oms_is_request_owner(text) to authenticated;
grant execute on function public.oms_can_insert_step(text) to authenticated;
grant execute on function public.oms_can_delete_request(text) to authenticated;
grant execute on function public.oms_can_act_step(text) to authenticated;
grant execute on function public.oms_review_steps(text[], text, text) to authenticated;

alter table public.users enable row level security;
alter table public.ot_requests enable row level security;
alter table public.approval_steps enable row level security;
alter table public.agency enable row level security;
alter table public.departments enable row level security;
alter table public.ot_types enable row level security;
alter table public.holidays enable row level security;
alter table public.day_of_week enable row level security;
alter table public.attachments enable row level security;
alter table public.users_menu enable row level security;

-- Remove the permissive legacy policies found in Production. Policies are
-- additive, so leaving any of these in place would bypass the stricter rules.
drop policy if exists "Allow All for Authenticated" on public.users;
drop policy if exists "Allow All for Authenticated" on public.ot_requests;
drop policy if exists "Allow All for Authenticated" on public.attachments;
drop policy if exists "Read Only for Users" on public.agency;
drop policy if exists "Read Only for Users" on public.approval_steps;
drop policy if exists "Read Only for Users" on public.day_of_week;
drop policy if exists "Read Only for Users" on public.departments;
drop policy if exists "Read Only for Users" on public.holidays;
drop policy if exists "Read Only for Users" on public.ot_types;
drop policy if exists "Read Only for Users" on public.users_menu;

-- Make the application policies safe to re-run during a controlled cutover.
drop policy if exists users_authenticated_read on public.users;
drop policy if exists users_superadmin_insert on public.users;
drop policy if exists users_superadmin_update on public.users;
drop policy if exists users_superadmin_delete on public.users;
drop policy if exists ot_requests_read_scope on public.ot_requests;
drop policy if exists ot_requests_owner_insert on public.ot_requests;
drop policy if exists ot_requests_owner_edit_pending on public.ot_requests;
drop policy if exists ot_requests_privileged_update on public.ot_requests;
drop policy if exists ot_requests_owner_delete_pending on public.ot_requests;
drop policy if exists approval_steps_read_scope on public.approval_steps;
drop policy if exists approval_steps_requester_insert on public.approval_steps;
drop policy if exists approval_steps_assignee_update on public.approval_steps;
drop policy if exists approval_steps_requester_delete_pending on public.approval_steps;
drop policy if exists agency_authenticated_read on public.agency;
drop policy if exists agency_superadmin_write on public.agency;
drop policy if exists departments_authenticated_read on public.departments;
drop policy if exists departments_superadmin_write on public.departments;
drop policy if exists ot_types_authenticated_read on public.ot_types;
drop policy if exists ot_types_superadmin_write on public.ot_types;
drop policy if exists holidays_authenticated_read on public.holidays;
drop policy if exists holidays_superadmin_write on public.holidays;
drop policy if exists day_of_week_authenticated_read on public.day_of_week;
drop policy if exists day_of_week_superadmin_write on public.day_of_week;
drop policy if exists attachments_read_scope on public.attachments;
drop policy if exists attachments_owner_insert on public.attachments;
drop policy if exists attachments_owner_delete on public.attachments;
drop policy if exists users_menu_authenticated_read on public.users_menu;
drop policy if exists users_menu_superadmin_write on public.users_menu;

-- USERS: active directory is readable; only SuperAdmin manages profiles.
create policy users_authenticated_read
on public.users for select to authenticated
using (status is true or public.oms_role() = 'SuperAdmin');

create policy users_superadmin_insert
on public.users for insert to authenticated
with check (public.oms_role() = 'SuperAdmin');

create policy users_superadmin_update
on public.users for update to authenticated
using (public.oms_role() = 'SuperAdmin')
with check (public.oms_role() = 'SuperAdmin');

create policy users_superadmin_delete
on public.users for delete to authenticated
using (public.oms_role() = 'SuperAdmin');

-- OT REQUESTS: every signed-in employee can read company-wide OT for the shared calendar.
-- Write/update/delete permissions remain restricted by the policies below.
create policy ot_requests_read_scope
on public.ot_requests for select to authenticated
using (true);

create policy ot_requests_owner_insert
on public.ot_requests for insert to authenticated
with check (user_id = public.oms_user_id() and status = 'Pending');

create policy ot_requests_owner_edit_pending
on public.ot_requests for update to authenticated
using (user_id = public.oms_user_id() and status = 'Pending')
with check (user_id = public.oms_user_id() and status = 'Pending');

create policy ot_requests_privileged_update
on public.ot_requests for update to authenticated
using (public.oms_is_privileged())
with check (public.oms_is_privileged());

create policy ot_requests_owner_delete_pending
on public.ot_requests for delete to authenticated
using (
    public.oms_can_delete_request(id)
);

-- APPROVAL STEPS: requester sees workflow; assigned reviewer sees/acts on current step.
create policy approval_steps_read_scope
on public.approval_steps for select to authenticated
using (
    approver_id = public.oms_user_id()
    or public.oms_is_privileged()
    or public.oms_is_request_owner(request_id)
);

create policy approval_steps_requester_insert
on public.approval_steps for insert to authenticated
with check (
    status = 'Pending'
    and public.oms_can_insert_step(request_id)
);

create policy approval_steps_assignee_update
on public.approval_steps for update to authenticated
using (public.oms_can_act_step(id));

create policy approval_steps_requester_delete_pending
on public.approval_steps for delete to authenticated
using (
    status = 'Pending'
    and public.oms_can_insert_step(request_id)
);

-- Reference data: every signed-in user reads; only SuperAdmin writes.
create policy agency_authenticated_read on public.agency for select to authenticated using (true);
create policy agency_superadmin_write on public.agency for all to authenticated using (public.oms_role() = 'SuperAdmin') with check (public.oms_role() = 'SuperAdmin');
create policy departments_authenticated_read on public.departments for select to authenticated using (true);
create policy departments_superadmin_write on public.departments for all to authenticated using (public.oms_role() = 'SuperAdmin') with check (public.oms_role() = 'SuperAdmin');
create policy ot_types_authenticated_read on public.ot_types for select to authenticated using (true);
create policy ot_types_superadmin_write on public.ot_types for all to authenticated using (public.oms_role() = 'SuperAdmin') with check (public.oms_role() = 'SuperAdmin');
create policy holidays_authenticated_read on public.holidays for select to authenticated using (true);
create policy holidays_superadmin_write on public.holidays for all to authenticated using (public.oms_role() = 'SuperAdmin') with check (public.oms_role() = 'SuperAdmin');
create policy day_of_week_authenticated_read on public.day_of_week for select to authenticated using (true);
create policy day_of_week_superadmin_write on public.day_of_week for all to authenticated using (public.oms_role() = 'SuperAdmin') with check (public.oms_role() = 'SuperAdmin');

create policy attachments_read_scope
on public.attachments for select to authenticated
using (public.oms_can_access_request(request_id));

create policy attachments_owner_insert
on public.attachments for insert to authenticated
with check (uploaded_by = public.oms_user_id() and public.oms_is_request_owner(request_id));

create policy attachments_owner_delete
on public.attachments for delete to authenticated
using (uploaded_by = public.oms_user_id() or public.oms_role() = 'SuperAdmin');

create policy users_menu_authenticated_read
on public.users_menu for select to authenticated using (true);

create policy users_menu_superadmin_write
on public.users_menu for all to authenticated
using (public.oms_role() = 'SuperAdmin')
with check (public.oms_role() = 'SuperAdmin');

-- Explicitly remove legacy anon access. Column grants for users are narrowed so password is excluded.
revoke all on public.users, public.ot_requests, public.approval_steps,
    public.agency, public.departments, public.ot_types, public.holidays,
    public.day_of_week, public.attachments, public.users_menu from anon;
revoke all on public.user_directory from anon;

revoke select on public.users from authenticated;
grant select (id, auth_user_id, username, employee_id, fullname, avatar_url, agency, department, role, status)
    on public.users to authenticated;
grant select on public.user_directory to authenticated;
grant insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.ot_requests to authenticated;
grant usage, select on sequence public.ot_request_seq to authenticated;
grant select, insert, delete on public.approval_steps to authenticated;
grant update (status, approved_at, comment) on public.approval_steps to authenticated;
grant select, insert, update, delete on public.agency, public.departments,
    public.ot_types, public.holidays, public.day_of_week, public.attachments,
    public.users_menu to authenticated;

-- Supabase Storage: profile images remain readable; only SuperAdmin can mutate avatars.
drop policy if exists "Allow Public Access 1oj01fe_0" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_1" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_2" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_3" on storage.objects;
drop policy if exists avatars_authenticated_read on storage.objects;
drop policy if exists avatars_superadmin_insert on storage.objects;
drop policy if exists avatars_superadmin_update on storage.objects;
drop policy if exists avatars_superadmin_delete on storage.objects;

create policy avatars_authenticated_read
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create policy avatars_superadmin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and public.oms_role() = 'SuperAdmin');

create policy avatars_superadmin_update
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and public.oms_role() = 'SuperAdmin')
with check (bucket_id = 'avatars' and public.oms_role() = 'SuperAdmin');

create policy avatars_superadmin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and public.oms_role() = 'SuperAdmin');

commit;
