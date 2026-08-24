-- Emergency access rollback only. This restores the legacy anon behavior temporarily.
-- It does not remove auth_user_id, Auth users, helper functions or migrated data.

begin;

alter table public.users disable row level security;
alter table public.ot_requests disable row level security;
alter table public.approval_steps disable row level security;
alter table public.agency disable row level security;
alter table public.departments disable row level security;
alter table public.ot_types disable row level security;
alter table public.holidays disable row level security;
alter table public.day_of_week disable row level security;
alter table public.attachments disable row level security;
alter table public.users_menu disable row level security;

grant select, insert, update, delete on public.users, public.ot_requests,
    public.approval_steps, public.agency, public.departments, public.ot_types,
    public.holidays, public.day_of_week, public.attachments, public.users_menu to anon;

drop policy if exists avatars_authenticated_read on storage.objects;
drop policy if exists avatars_superadmin_insert on storage.objects;
drop policy if exists avatars_superadmin_update on storage.objects;
drop policy if exists avatars_superadmin_delete on storage.objects;

-- Restore the legacy avatars policies exactly as they existed before the
-- Production cutover. This is emergency compatibility, not the secure target.
drop policy if exists "Allow Public Access 1oj01fe_0" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_1" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_2" on storage.objects;
drop policy if exists "Allow Public Access 1oj01fe_3" on storage.objects;
create policy "Allow Public Access 1oj01fe_0"
on storage.objects for select to public
using (bucket_id = 'avatars');
create policy "Allow Public Access 1oj01fe_1"
on storage.objects for insert to public
with check (bucket_id = 'avatars');
create policy "Allow Public Access 1oj01fe_2"
on storage.objects for update to public
using (bucket_id = 'avatars');
create policy "Allow Public Access 1oj01fe_3"
on storage.objects for delete to public
using (bucket_id = 'avatars');

drop function if exists public.oms_review_steps(text[], text, text);

revoke usage, select on sequence public.ot_request_seq from authenticated;

commit;
