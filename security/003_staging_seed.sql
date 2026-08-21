-- Staging-only reference data and four role profiles.
-- Create the four matching Supabase Auth accounts before running this script.

begin;

do $$
begin
    if (
        select count(*)
        from auth.users
        where email in (
            'ot.user.staging@smetaltech.test',
            'ot.superuser.staging@smetaltech.test',
            'ot.admin.staging@smetaltech.test',
            'ot.superadmin.staging@smetaltech.test'
        )
    ) <> 4 then
        raise exception 'Create all four Staging Auth users before running 003_staging_seed.sql';
    end if;
end $$;

insert into public.agency (id, name) values
    ('AGC-001', 'Machine'),
    ('AGC-014', 'HR')
on conflict (id) do update set name = excluded.name;

insert into public.departments (id, name) values
    ('DPM-001', 'ฝ่ายผลิต MA'),
    ('DPM-002', 'ฝ่ายบุคคล')
on conflict (id) do update set name = excluded.name;

insert into public.ot_types (id, start_time, end_time, rate) values
    ('OT-001', '17:00', '20:00', 1.5),
    ('OT-002', '05:00', '08:00', 1.5),
    ('OT-003', '08:00', '17:00', 1.0),
    ('OT-004', '20:00', '05:00', 1.0)
on conflict (id) do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    rate = excluded.rate;

insert into public.day_of_week (day_name, is_working, day_number) values
    ('Monday', true, 1), ('Tuesday', true, 2), ('Wednesday', true, 3),
    ('Thursday', true, 4), ('Friday', true, 5), ('Saturday', true, 6),
    ('Sunday', false, 7)
on conflict (day_name) do update set
    is_working = excluded.is_working,
    day_number = excluded.day_number;

insert into public.users (
    id, username, password, fullname, agency_id, department_id,
    role, status, agency, department, employee_id, auth_user_id
)
select * from (
    values
        ('TEST-001', 'ot.user.staging@smetaltech.test', 'AUTH_MANAGED', 'ทดสอบ พนักงาน', 'AGC-001', 'DPM-001', 'User', true, 'AGC-001', 'DPM-001', '9001', (select id from auth.users where email = 'ot.user.staging@smetaltech.test')),
        ('TEST-002', 'ot.superuser.staging@smetaltech.test', 'AUTH_MANAGED', 'ทดสอบ หัวหน้างาน', 'AGC-001', 'DPM-001', 'SuperUser', true, 'AGC-001', 'DPM-001', '9002', (select id from auth.users where email = 'ot.superuser.staging@smetaltech.test')),
        ('TEST-003', 'ot.admin.staging@smetaltech.test', 'AUTH_MANAGED', 'ทดสอบ ผู้จัดการ', 'AGC-001', 'DPM-001', 'Admin', true, 'AGC-001', 'DPM-001', '9003', (select id from auth.users where email = 'ot.admin.staging@smetaltech.test')),
        ('TEST-004', 'ot.superadmin.staging@smetaltech.test', 'AUTH_MANAGED', 'ทดสอบ ผู้ดูแลระบบ', 'AGC-014', 'DPM-002', 'SuperAdmin', true, 'AGC-014', 'DPM-002', '9004', (select id from auth.users where email = 'ot.superadmin.staging@smetaltech.test'))
) as seed(id, username, password, fullname, agency_id, department_id, role, status, agency, department, employee_id, auth_user_id)
on conflict (id) do update set
    username = excluded.username,
    fullname = excluded.fullname,
    agency_id = excluded.agency_id,
    department_id = excluded.department_id,
    role = excluded.role,
    status = excluded.status,
    agency = excluded.agency,
    department = excluded.department,
    employee_id = excluded.employee_id,
    auth_user_id = excluded.auth_user_id;

commit;

select role, count(*) as profile_count
from public.users
group by role
order by role;
