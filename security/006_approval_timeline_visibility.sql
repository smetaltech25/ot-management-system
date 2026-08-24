-- Allow every active authenticated OMS user to view the approval timeline
-- shown in the company-wide OT calendar without widening table-level RLS.

begin;

create or replace function public.oms_approval_timeline(target_request_id text)
returns table(
    approver_id text,
    step_order integer,
    status text,
    approved_at text,
    comment text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        s.approver_id,
        s.step_order,
        s.status,
        s.approved_at,
        s.comment
    from public.approval_steps s
    where public.oms_user_id() is not null
      and s.request_id = target_request_id
    order by s.step_order
$$;

revoke all on function public.oms_approval_timeline(text) from public, anon, authenticated;
grant execute on function public.oms_approval_timeline(text) to authenticated;

comment on function public.oms_approval_timeline(text) is
    'Returns the non-secret approval timeline for a calendar-visible OT request to active authenticated OMS users.';

commit;
