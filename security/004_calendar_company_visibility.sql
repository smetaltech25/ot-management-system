-- Staging migration: company-wide OT calendar visibility
-- Business rule: every authenticated employee may view OT across all departments.
-- This changes SELECT only. Insert/update/delete/review permissions are unchanged.

begin;

drop policy if exists ot_requests_read_scope on public.ot_requests;

create policy ot_requests_read_scope
on public.ot_requests for select to authenticated
using (true);

commit;

-- Verification (run separately if desired):
-- select policyname, roles, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'ot_requests'
-- order by policyname;
