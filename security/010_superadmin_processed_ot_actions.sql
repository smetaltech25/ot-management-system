-- Transaction-safe SuperAdmin actions for processed OT requests.
-- Editing keeps the current Approved/Rejected status; resetting returns the workflow to Step 1.

begin;

create or replace function public.oms_superadmin_update_processed_ot(
    target_request_id text,
    target_ot_type_id text,
    target_date_start text,
    target_description text
)
returns table(request_id text, request_status text, ot_type_id text, date_start text, description text)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or public.oms_role() <> 'SuperAdmin' then
        raise exception 'SuperAdmin permission required';
    end if;

    if nullif(btrim(target_request_id), '') is null
       or nullif(btrim(target_ot_type_id), '') is null
       or target_date_start !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Invalid processed OT update input';
    end if;

    if not exists (select 1 from public.ot_types t where t.id = target_ot_type_id) then
        raise exception 'OT type not found';
    end if;

    return query
    update public.ot_requests r
    set ot_type_id = target_ot_type_id,
        date_start = target_date_start,
        description = coalesce(btrim(target_description), '')
    where r.id = target_request_id
      and r.status in ('Approved', 'Rejected')
    returning r.id, r.status, r.ot_type_id, r.date_start, r.description;

    if not found then
        raise exception 'Processed OT request not found';
    end if;
end;
$$;

create or replace function public.oms_superadmin_reset_processed_ot(target_request_id text)
returns table(request_id text, request_status text, reset_step_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_status text;
    affected_steps integer;
begin
    if auth.uid() is null or public.oms_role() <> 'SuperAdmin' then
        raise exception 'SuperAdmin permission required';
    end if;

    select r.status
    into existing_status
    from public.ot_requests r
    where r.id = target_request_id
    for update;

    if not found or existing_status not in ('Approved', 'Rejected') then
        raise exception 'Processed OT request not found';
    end if;

    update public.approval_steps s
    set status = 'Pending',
        approved_at = null,
        comment = null
    where s.request_id = target_request_id;

    get diagnostics affected_steps = row_count;
    if affected_steps = 0 then
        raise exception 'Approval workflow not found';
    end if;

    update public.ot_requests r
    set status = 'Pending',
        current_step = 1,
        rejected_reason = null
    where r.id = target_request_id;

    return query
    select target_request_id, 'Pending'::text, affected_steps;
end;
$$;

revoke all on function public.oms_superadmin_update_processed_ot(text, text, text, text) from public, anon;
revoke all on function public.oms_superadmin_reset_processed_ot(text) from public, anon;
grant execute on function public.oms_superadmin_update_processed_ot(text, text, text, text) to authenticated;
grant execute on function public.oms_superadmin_reset_processed_ot(text) to authenticated;

commit;
