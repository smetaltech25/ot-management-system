-- Remove obsolete plaintext password copies from public profiles.
-- Active credentials remain managed exclusively by Supabase Auth.

begin;

alter table public.users
    alter column password drop not null;

update public.users
set password = null
where password is not null;

comment on column public.users.password is
    'Deprecated legacy field. Always NULL; active credentials are managed by Supabase Auth.';

commit;
