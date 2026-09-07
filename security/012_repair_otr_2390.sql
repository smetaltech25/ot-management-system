-- Repair the two missing future approval steps for OTR-2390.
-- The approvers are resolved from the two adjacent Bending requests OTR-2393
-- and OTR-2404, which both have the same Step 1/2/3 route.

begin;

do $$
declare
    step_1_approver_id text;
    step_2_approver_id text;
    step_3_approver_id text;
    original_assigned_date text;
begin
    if not exists (
        select 1
        from public.ot_requests r
        where r.id = 'OTR-2390'
          and r.status = 'Pending'
    ) then
        raise exception 'OTR-2390 is missing or no longer Pending';
    end if;

    if (
        select count(*)
        from public.approval_steps s
        where s.request_id = 'OTR-2390'
    ) <> 1 then
        raise exception 'OTR-2390 no longer has exactly one approval step; stop for manual review';
    end if;

    select s.approver_id, s.assigned_date
    into step_1_approver_id, original_assigned_date
    from public.approval_steps s
    where s.request_id = 'OTR-2390'
      and s.step_order = 1
      and s.status = 'Approved';

    if step_1_approver_id is null then
        raise exception 'OTR-2390 Step 1 is not the expected approved step';
    end if;

    select s2.approver_id, s3.approver_id
    into step_2_approver_id, step_3_approver_id
    from public.approval_steps s1
    join public.approval_steps s2
      on s2.request_id = s1.request_id and s2.step_order = 2
    join public.approval_steps s3
      on s3.request_id = s1.request_id and s3.step_order = 3
    where s1.request_id in ('OTR-2393', 'OTR-2404')
      and s1.step_order = 1
      and s1.approver_id = step_1_approver_id
    group by s2.approver_id, s3.approver_id
    having count(*) = 2;

    if step_2_approver_id is null or step_3_approver_id is null then
        raise exception 'Adjacent Bending requests do not agree on the Step 2/3 approvers';
    end if;

    if original_assigned_date is null then
        select r.submit_date
        into original_assigned_date
        from public.ot_requests r
        where r.id = 'OTR-2390';
    end if;

    insert into public.approval_steps(id, request_id, step_order, approver_id, assigned_date, status)
    values
        ('OTR-2390-STEP2', 'OTR-2390', 2, step_2_approver_id, original_assigned_date, 'Pending'),
        ('OTR-2390-STEP3', 'OTR-2390', 3, step_3_approver_id, original_assigned_date, 'Pending');
end;
$$;

commit;
