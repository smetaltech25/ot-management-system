-- Delete an unreferenced OMS profile through a tightly scoped service-role RPC.
-- USER-002 (po2) and USER-004 (admin) are permanent system accounts.

begin;

create or replace function public.oms_delete_user_profile(target_user_id text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    target_auth_user_id uuid;
begin
    if target_user_id in ('USER-002', 'USER-004') then
        raise exception 'บัญชีผู้ดูแลระบบหลักไม่สามารถลบได้';
    end if;

    select u.auth_user_id
    into target_auth_user_id
    from public.users u
    where u.id = target_user_id;

    if not found then
        raise exception 'ไม่พบผู้ใช้งานที่ต้องการลบ';
    end if;

    if exists (select 1 from public.ot_requests r where r.user_id = target_user_id)
       or exists (select 1 from public.approval_steps s where s.approver_id = target_user_id)
       or exists (select 1 from public.attachments a where a.uploaded_by = target_user_id) then
        raise exception 'บัญชีนี้มีประวัติ OT ขั้นตอนอนุมัติ หรือไฟล์แนบ กรุณาปิดสถานะการใช้งานแทน';
    end if;

    delete from public.users u
    where u.id = target_user_id;

    return target_auth_user_id;
end;
$$;

revoke all on function public.oms_delete_user_profile(text) from public, anon, authenticated;
grant execute on function public.oms_delete_user_profile(text) to service_role;

comment on function public.oms_delete_user_profile(text) is
    'Deletes an unreferenced OMS profile for the admin-user Edge Function; permanent system accounts are protected.';

commit;
