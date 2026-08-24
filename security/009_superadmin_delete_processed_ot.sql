-- Allow only active SuperAdmin users to permanently delete processed OT requests.
-- approval_steps and attachment records follow through existing ON DELETE CASCADE FKs.

begin;

drop policy if exists ot_requests_superadmin_delete_processed on public.ot_requests;

create policy ot_requests_superadmin_delete_processed
on public.ot_requests for delete to authenticated
using (
    public.oms_role() = 'SuperAdmin'
    and status in ('Approved', 'Rejected')
);

commit;
