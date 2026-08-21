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

drop function if exists public.oms_review_steps(text[], text, text);

revoke usage, select on sequence public.ot_request_seq from authenticated;

commit;
