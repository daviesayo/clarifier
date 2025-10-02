-- Auto-create profiles on auth.users insert (bypasses RLS safely)
-- Run this in Supabase SQL editor (or via your migration runner)

-- 1) Create function that inserts into public.profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert only if not exists, id/email come from auth.users
  insert into public.profiles (id, email, usage_count, tier)
  values (new.id, new.email, 0, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) Ensure owner has rights and function runs with definer privileges
revoke all on function public.handle_new_user() from public;

-- 3) Create trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4) (Optional) Backfill existing users without profiles
insert into public.profiles (id, email, usage_count, tier)
select u.id, u.email, 0, 'free'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Notes:
-- - SECURITY DEFINER lets the function insert despite RLS.
-- - RLS policies on public.profiles remain enforced for normal client ops.
-- - This is the Supabase-recommended pattern for profile auto-provisioning.


