-- Minimal schema clone for OT-Management-System Staging.
-- Contains structure only: no employee passwords or production OT records.

begin;

create sequence if not exists public.ot_request_seq start 1;

create table if not exists public.agency (
    id text primary key,
    name text not null
);

create table if not exists public.departments (
    id text primary key,
    name text not null
);

create table if not exists public.ot_types (
    id text primary key,
    start_time text not null,
    end_time text not null,
    rate numeric not null
);

create table if not exists public.users (
    id text primary key,
    username text not null unique,
    password text not null,
    fullname text not null,
    agency_id text references public.agency(id),
    department_id text references public.departments(id),
    role text not null,
    created_at text,
    avatar_url text,
    signature_url text,
    status boolean default true,
    agency text,
    department text,
    employee_id text
);

create table if not exists public.ot_requests (
    id text primary key default ('OTR-' || to_char(nextval('public.ot_request_seq'), 'FM0000')),
    description text,
    date_start text not null,
    user_id text references public.users(id),
    ot_type_id text references public.ot_types(id),
    status text default 'Pending',
    current_step integer,
    rejected_reason text,
    submit_date text
);

create table if not exists public.approval_steps (
    id text primary key,
    request_id text references public.ot_requests(id) on delete cascade,
    step_order integer not null,
    approver_id text references public.users(id),
    assigned_date text,
    approved_at text,
    status text default 'Pending',
    comment text
);

create table if not exists public.attachments (
    id text primary key,
    request_id text references public.ot_requests(id) on delete cascade,
    file_url text not null,
    uploaded_by text references public.users(id),
    uploaded_at text
);

create table if not exists public.holidays (
    id text primary key,
    holiday_date text not null,
    description text
);

create table if not exists public.day_of_week (
    day_name text primary key,
    is_working boolean default true,
    day_number integer
);

create table if not exists public.users_menu (
    id serial primary key,
    menu_name text not null,
    menu_id text not null,
    super_admin boolean default false,
    admin boolean default false,
    super_user boolean default false,
    user_role boolean default false,
    "user" boolean
);

commit;

