-- Make OT request creation/editing and approval updates atomic.
-- This closes the race where an edit form opened before Step 1 approval could
-- later delete only the still-Pending Step 2/3 rows and leave an incomplete workflow.

begin;

create or replace function public.oms_save_pending_ot_request(
    target_request_id text,
    target_ot_type_id text,
    target_date_start text,
    target_description text,
    target_approver_ids text[]
)
returns table(request_id text, operation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_user_id text;
    saved_request_id text;
    existing_status text;
    submitted_at text;
    eligible_approver_count integer;
begin
    actor_user_id := public.oms_user_id();
    if actor_user_id is null then
        raise exception 'Authentication required';
    end if;

    if nullif(btrim(target_ot_type_id), '') is null
       or nullif(btrim(target_date_start), '') is null
       or nullif(btrim(target_description), '') is null then
        raise exception 'OT date, type and description are required';
    end if;

    if coalesce(cardinality(target_approver_ids), 0) <> 3
       or exists (
           select 1
           from unnest(target_approver_ids) as selected(approver_id)
           where selected.approver_id is null
       )
       or (
           select count(distinct selected.approver_id)
           from unnest(target_approver_ids) as selected(approver_id)
       ) <> 3 then
        raise exception 'Exactly three distinct approvers are required';
    end if;

    select count(*)
    into eligible_approver_count
    from public.users u
    where u.id = any(target_approver_ids)
      and u.status is true
      and u.role in ('SuperUser', 'Admin', 'SuperAdmin');

    if eligible_approver_count <> 3 then
        raise exception 'One or more approvers are missing, inactive, or ineligible';
    end if;

    submitted_at := to_char(timezone('Asia/Bangkok', now()), 'DD/MM/YYYY : HH24:MI');

    if nullif(btrim(target_request_id), '') is null then
        insert into public.ot_requests(description, date_start, user_id, ot_type_id, status, submit_date)
        values (btrim(target_description), target_date_start, actor_user_id, target_ot_type_id, 'Pending', submitted_at)
        returning id into saved_request_id;
    else
        select r.status
        into existing_status
        from public.ot_requests r
        where r.id = target_request_id
          and r.user_id = actor_user_id
        for update;

        if not found then
            raise exception 'OT request not found or not owned by the current user';
        end if;

        if existing_status <> 'Pending' then
            raise exception 'The OT request is no longer pending';
        end if;

        -- Lock every current step after locking the parent request. Approval RPCs
        -- take the same parent lock first, so edit and approval cannot interleave.
        perform 1
        from public.approval_steps s
        where s.request_id = target_request_id
        order by s.step_order
        for update;

        if exists (
            select 1
            from public.approval_steps s
            where s.request_id = target_request_id
              and s.status <> 'Pending'
        ) then
            raise exception 'The approval workflow has already started';
        end if;

        update public.ot_requests r
        set description = btrim(target_description),
            date_start = target_date_start,
            ot_type_id = target_ot_type_id,
            submit_date = submitted_at
        where r.id = target_request_id;

        delete from public.approval_steps s
        where s.request_id = target_request_id;

        saved_request_id := target_request_id;
    end if;

    insert into public.approval_steps(id, request_id, step_order, approver_id, assigned_date, status)
    values
        (saved_request_id || '-STEP1', saved_request_id, 1, target_approver_ids[1], submitted_at, 'Pending'),
        (saved_request_id || '-STEP2', saved_request_id, 2, target_approver_ids[2], submitted_at, 'Pending'),
        (saved_request_id || '-STEP3', saved_request_id, 3, target_approver_ids[3], submitted_at, 'Pending');

    return query
    select saved_request_id, case when target_request_id is null then 'created'::text else 'updated'::text end;
end;
$$;

revoke all on function public.oms_save_pending_ot_request(text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.oms_save_pending_ot_request(text, text, text, text, text[]) to authenticated;

-- Serialize approval against request edits and keep all step/request status writes
-- inside one transaction.
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
    target_request_ids text[];
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

    select array_agg(distinct s.request_id order by s.request_id)
    into target_request_ids
    from public.approval_steps s
    where s.id = any(target_step_ids);

    if coalesce(cardinality(target_request_ids), 0) = 0 then
        raise exception 'One or more approval steps are missing';
    end if;

    perform 1
    from public.ot_requests r
    where r.id = any(target_request_ids)
    order by r.id
    for update;

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
        update public.approval_steps s
        set status = 'Rejected'
        where s.request_id = any(target_request_ids)
          and s.status = 'Pending';

        update public.ot_requests r
        set status = 'Rejected'
        where r.id = any(target_request_ids);
    else
        update public.ot_requests r
        set status = 'Approved'
        where r.id = any(target_request_ids)
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

revoke all on function public.oms_review_steps(text[], text, text) from public, anon, authenticated;
grant execute on function public.oms_review_steps(text[], text, text) to authenticated;

-- Old cached clients may still use the direct edit path. Never let that path
-- delete only Pending future steps after an approval has already happened.
create or replace function public.oms_block_partial_approval_step_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.status = 'Pending'
       and exists (
           select 1
           from public.ot_requests r
           where r.id = old.request_id
             and r.status = 'Pending'
       )
       and exists (
           select 1
           from public.approval_steps acted
           where acted.request_id = old.request_id
             and acted.status <> 'Pending'
       ) then
        raise exception 'Cannot delete pending steps after approval has started';
    end if;

    return old;
end;
$$;

drop trigger if exists approval_steps_block_partial_delete on public.approval_steps;
create trigger approval_steps_block_partial_delete
before delete on public.approval_steps
for each row execute function public.oms_block_partial_approval_step_delete();

-- Every insert statement that creates or repairs a workflow must leave exactly
-- three distinct approvers at Step 1, 2 and 3. Existing rows are not changed.
create or replace function public.oms_require_complete_inserted_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1
        from (select distinct request_id from inserted_steps) affected
        where (select count(*) from public.approval_steps s where s.request_id = affected.request_id) <> 3
           or (select count(distinct s.step_order) from public.approval_steps s where s.request_id = affected.request_id) <> 3
           or (select min(s.step_order) from public.approval_steps s where s.request_id = affected.request_id) <> 1
           or (select max(s.step_order) from public.approval_steps s where s.request_id = affected.request_id) <> 3
           or (select count(distinct s.approver_id) from public.approval_steps s where s.request_id = affected.request_id) <> 3
    ) then
        raise exception 'Every OT request requires distinct approvers at Step 1, 2 and 3';
    end if;

    return null;
end;
$$;

drop trigger if exists approval_steps_require_complete_insert on public.approval_steps;
create trigger approval_steps_require_complete_insert
after insert on public.approval_steps
referencing new table as inserted_steps
for each statement execute function public.oms_require_complete_inserted_workflow();

-- A request can never reach Approved unless its complete 1-2-3 workflow is approved.
create or replace function public.oms_require_complete_workflow_for_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'Approved' and (
        select count(*) <> 3
            or count(distinct s.step_order) <> 3
            or min(s.step_order) <> 1
            or max(s.step_order) <> 3
            or count(*) filter (where s.status = 'Approved') <> 3
        from public.approval_steps s
        where s.request_id = new.id
    ) then
        raise exception 'A complete approved 3-step workflow is required';
    end if;

    return new;
end;
$$;

drop trigger if exists ot_requests_require_complete_workflow on public.ot_requests;
create trigger ot_requests_require_complete_workflow
before insert or update of status on public.ot_requests
for each row execute function public.oms_require_complete_workflow_for_approval();

commit;
