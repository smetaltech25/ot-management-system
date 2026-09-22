-- 013_superadmin_delete_any_ot.sql
-- Allow SuperAdmin to permanently delete any OT requests regardless of status (Pending, Approved, Rejected)
-- Enables clearing OT records from the OT Reports page (page5) and admin workflows.

begin;

drop policy if exists ot_requests_superadmin_delete_processed on public.ot_requests;
drop policy if exists ot_requests_superadmin_delete_any on public.ot_requests;

create policy ot_requests_superadmin_delete_any
on public.ot_requests for delete to authenticated
using (
    public.oms_role() = 'SuperAdmin'
);

commit;
