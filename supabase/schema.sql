-- île de païn · The Island Club
-- Run once on a fresh Supabase project (SQL editor, or via the Supabase connector).
-- Everything the apps do goes through the functions at the bottom, so members can never
-- read or change anyone else's data, and only staff can redeem.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.tiers (
  id text primary key,
  name text not null,
  price_cents int not null,
  tagline text,
  perks jsonb not null,          -- [{item, qty, per: day|week|month|birthday}]
  extras text[] default '{}',
  sort int default 0
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  birthday date,
  role text not null default 'member' check (role in ('member','staff','admin')),
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles on delete cascade,
  tier_id text references public.tiers,
  status text not null default 'pending' check (status in ('pending','active','paused','cancelled')),
  paid_until date,
  started_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payments (
  id bigserial primary key,
  user_id uuid references public.profiles on delete cascade,
  tier_id text,
  amount_cents int,
  months int not null default 1,
  method text not null default 'manual',
  reference text,
  recorded_by uuid references public.profiles,
  created_at timestamptz default now()
);

create table if not exists public.redemptions (
  id bigserial primary key,
  user_id uuid references public.profiles on delete cascade,
  item text not null,
  qty int not null default 1,
  staff_id uuid references public.profiles,
  created_at timestamptz default now()
);
create index if not exists redemptions_user_time on public.redemptions(user_id, created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings(key,value)
  values ('qr_secret', encode(extensions.gen_random_bytes(32),'hex'))
  on conflict (key) do nothing;

-- ───────────────────────── tiers ─────────────────────────
insert into public.tiers(id,name,price_cents,tagline,perks,extras,sort) values
 ('islander','Islander',19900,'Your weekly loaf, sorted.',
  '[{"item":"loaf","qty":1,"per":"week"}]',
  array['Member card in the app'],1),
 ('harbour','Harbour Club',49900,'Bread and coffee, every week.',
  '[{"item":"loaf","qty":1,"per":"week"},{"item":"cappuccino","qty":2,"per":"week"},{"item":"birthday","qty":1,"per":"birthday"}]',
  array['Birthday pastry on us'],2),
 ('royale','Île Royale',149900,'The island, every day.',
  '[{"item":"loaf","qty":2,"per":"week"},{"item":"cappuccino","qty":5,"per":"week"},{"item":"cappuccino","qty":1,"per":"day"},{"item":"pastry","qty":1,"per":"week"},{"item":"bouquet","qty":1,"per":"month"},{"item":"birthday","qty":1,"per":"birthday"}]',
  array['Birthday pastry on us'],3)
on conflict (id) do update set name=excluded.name, price_cents=excluded.price_cents, tagline=excluded.tagline,
  perks=excluded.perks, extras=excluded.extras, sort=excluded.sort;

-- ───────────────────────── security ─────────────────────────
alter table public.tiers enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.redemptions enable row level security;

drop policy if exists tiers_read on public.tiers;
create policy tiers_read on public.tiers for select using (true);
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select using ((select auth.uid()) = id);
drop policy if exists own_sub on public.subscriptions;
create policy own_sub on public.subscriptions for select using ((select auth.uid()) = user_id);
drop policy if exists own_redemptions on public.redemptions;
create policy own_redemptions on public.redemptions for select using ((select auth.uid()) = user_id);
drop policy if exists own_payments on public.payments;
create policy own_payments on public.payments for select using ((select auth.uid()) = user_id);

-- new sign-ups get a profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.sa_today() returns date language sql stable set search_path = public as
$$ select (now() at time zone 'Africa/Johannesburg')::date $$;

-- weeks run Tuesday to Monday (they open on Tuesdays)
create or replace function public.period_start(per text, bday date) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d date := public.sa_today();
begin
  if per = 'day' then return (d::timestamp at time zone 'Africa/Johannesburg');
  elsif per = 'week' then return ((d - ((extract(isodow from d)::int - 2 + 7) % 7))::timestamp at time zone 'Africa/Johannesburg');
  elsif per = 'month' then return (date_trunc('month', d)::timestamp at time zone 'Africa/Johannesburg');
  elsif per = 'birthday' then return (date_trunc('year', d)::timestamp at time zone 'Africa/Johannesburg');
  end if;
  return now();
end $$;

create or replace function public.role_of(uid uuid) returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = uid $$;

-- what a member has left right now
create or replace function public.balances(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  perks jsonb; r jsonb; bday date; used int; left_ int; allow int; res jsonb := '{}'::jsonb; it text;
begin
  select t.perks, p.birthday into perks, bday
    from public.subscriptions s join public.tiers t on t.id = s.tier_id join public.profiles p on p.id = s.user_id
    where s.user_id = uid;
  if perks is null then return res; end if;
  for r in select * from jsonb_array_elements(perks) loop
    it := r->>'item'; allow := (r->>'qty')::int;
    if r->>'per' = 'birthday' and (bday is null or extract(month from bday) <> extract(month from public.sa_today())) then
      allow := 0;
    end if;
    select coalesce(sum(qty),0) into used from public.redemptions
      where user_id = uid and item = it and created_at >= public.period_start(r->>'per', bday);
    left_ := greatest(allow - used, 0);
    if res ? it then
      -- several rules for one item (e.g. 5 a week but 1 a day): the tightest wins
      if left_ < (res->it->>'left')::int then
        res := jsonb_set(res, array[it], jsonb_build_object('allow', allow, 'used', used, 'left', left_, 'per', r->>'per'));
      end if;
    else
      res := res || jsonb_build_object(it, jsonb_build_object('allow', allow, 'used', used, 'left', left_, 'per', r->>'per'));
    end if;
  end loop;
  return res;
end $$;

create or replace function public.is_active(uid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.subscriptions where user_id = uid and status = 'active' and paid_until >= public.sa_today()) $$;

-- QR codes change every 30 seconds and are signed, so screenshots and old codes fail
create or replace function public.qr_sign(uid uuid, win bigint) returns text
language sql stable security definer set search_path = public as $$
  select substr(encode(extensions.hmac(uid::text || ':' || win::text,
         (select value from private.settings where key = 'qr_secret'), 'sha256'),'hex'),1,20)
$$;

create or replace function public.qr_check(token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; uid uuid; win bigint; now_win bigint := floor(extract(epoch from now())/30);
begin
  parts := string_to_array(replace(token,'IDPCLUB:',''), '.');
  if array_length(parts,1) <> 3 then return null; end if;
  begin uid := parts[1]::uuid; win := parts[2]::bigint; exception when others then return null; end;
  if win < now_win - 4 or win > now_win + 1 then return null; end if;   -- 2 minutes of grace so staff can finish serving
  if parts[3] <> public.qr_sign(uid, win) then return null; end if;
  return uid;
end $$;

-- ───────────────────────── member functions ─────────────────────────
create or replace function public.my_card() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); win bigint := floor(extract(epoch from now())/30); p record; s record; t record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where id = uid;
  select * into s from public.subscriptions where user_id = uid;
  select * into t from public.tiers where id = s.tier_id;
  return jsonb_build_object(
    'name', p.full_name, 'phone', p.phone, 'role', p.role, 'birthday', p.birthday,
    'tier', t.id, 'tier_name', t.name, 'price_cents', t.price_cents, 'extras', t.extras,
    'status', coalesce(s.status,'none'), 'paid_until', s.paid_until, 'active', public.is_active(uid),
    'balances', public.balances(uid),
    'token', 'IDPCLUB:' || uid || '.' || win || '.' || public.qr_sign(uid, win),
    'expires_in', 30 - (floor(extract(epoch from now()))::bigint % 30),
    'history', coalesce((select jsonb_agg(h) from (select item, qty, created_at from public.redemptions
                where user_id = uid order by created_at desc limit 30) h), '[]'::jsonb));
end $$;

create or replace function public.choose_tier(tier text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists(select 1 from public.tiers where id = tier) then raise exception 'unknown tier'; end if;
  insert into public.subscriptions(user_id, tier_id, status) values (auth.uid(), tier, 'pending')
  on conflict (user_id) do update set tier_id = excluded.tier_id, updated_at = now(),
    status = case when public.subscriptions.status = 'active' then 'active' else 'pending' end;
end $$;

create or replace function public.update_my_profile(full_name text, phone text, birthday date) returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = $1, phone = $2, birthday = coalesce(profiles.birthday, $3) where id = auth.uid();
$$;

-- ───────────────────────── staff functions ─────────────────────────
create or replace function public.staff_lookup(token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; p record; s record; t record;
begin
  if coalesce(public.role_of(auth.uid()),'') not in ('staff','admin') then raise exception 'staff only'; end if;
  uid := public.qr_check(token);
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'This code has expired or is not valid. Ask the member to open their card again.'); end if;
  select * into p from public.profiles where id = uid;
  select * into s from public.subscriptions where user_id = uid;
  select * into t from public.tiers where id = s.tier_id;
  if not public.is_active(uid) then
    return jsonb_build_object('ok', false, 'name', p.full_name, 'tier_name', t.name,
      'reason', case when s.status = 'active' then 'Membership payment is overdue.' when s.status is null then 'No membership on this account.' when s.status = 'pending' then 'Membership has not been paid yet.' else 'Membership is ' || s.status || '.' end);
  end if;
  return jsonb_build_object('ok', true, 'name', p.full_name, 'tier', t.id, 'tier_name', t.name,
    'paid_until', s.paid_until, 'balances', public.balances(uid));
end $$;

create or replace function public.staff_redeem(token text, item text, qty int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; b jsonb;
begin
  if coalesce(public.role_of(auth.uid()),'') not in ('staff','admin') then raise exception 'staff only'; end if;
  uid := public.qr_check(token);
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'This code has expired. Ask the member to open their card again.'); end if;
  if not public.is_active(uid) then return jsonb_build_object('ok', false, 'reason', 'Membership is not active.'); end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));          -- no double taps
  b := public.balances(uid);
  if coalesce((b->item->>'left')::int, 0) < qty then
    return jsonb_build_object('ok', false, 'reason', 'Nothing left for this item right now.', 'balances', b);
  end if;
  insert into public.redemptions(user_id, item, qty, staff_id) values (uid, item, qty, auth.uid());
  return jsonb_build_object('ok', true, 'balances', public.balances(uid));
end $$;

-- ───────────────────────── admin functions ─────────────────────────
create or replace function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.role_of(auth.uid()),'') <> 'admin' then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(m order by m.created_at desc) from (
        select p.id, p.full_name, u.email, p.phone, p.role, p.created_at, s.tier_id, s.status, s.paid_until,
               public.is_active(p.id) as active,
               (select count(*) from public.redemptions r where r.user_id = p.id and r.created_at >= now() - interval '30 days') as uses_30d
        from public.profiles p join auth.users u on u.id = p.id left join public.subscriptions s on s.user_id = p.id) m), '[]'::jsonb),
    'today', coalesce((select jsonb_agg(x) from (
        select r.item, r.qty, r.created_at, p.full_name, st.full_name as staff
        from public.redemptions r join public.profiles p on p.id = r.user_id left join public.profiles st on st.id = r.staff_id
        where r.created_at >= public.period_start('day', null) order by r.created_at desc) x), '[]'::jsonb),
    'mrr_cents', coalesce((select sum(t.price_cents) from public.subscriptions s join public.tiers t on t.id = s.tier_id
        where s.status = 'active' and s.paid_until >= public.sa_today()), 0),
    'tiers', (select jsonb_agg(t order by t.sort) from public.tiers t));
end $$;

create or replace function public.admin_record_payment(uid uuid, months int default 1, reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s record; t record;
begin
  if coalesce(public.role_of(auth.uid()),'') <> 'admin' then raise exception 'admin only'; end if;
  select * into s from public.subscriptions where user_id = uid;
  if s is null then raise exception 'member has not chosen a tier'; end if;
  select * into t from public.tiers where id = s.tier_id;
  update public.subscriptions set status = 'active', updated_at = now(),
    paid_until = (greatest(coalesce(paid_until, public.sa_today() - 1), public.sa_today() - 1) + make_interval(months => months))::date
    where user_id = uid;
  insert into public.payments(user_id, tier_id, amount_cents, months, method, reference, recorded_by)
    values (uid, s.tier_id, t.price_cents * months, months, 'manual', reference, auth.uid());
end $$;

create or replace function public.admin_set_member(uid uuid, tier text, status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.role_of(auth.uid()),'') <> 'admin' then raise exception 'admin only'; end if;
  insert into public.subscriptions(user_id, tier_id, status) values (uid, tier, status)
  on conflict (user_id) do update set tier_id = excluded.tier_id, status = excluded.status, updated_at = now();
end $$;

create or replace function public.admin_set_role(uid uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.role_of(auth.uid()),'') <> 'admin' then raise exception 'admin only'; end if;
  if new_role not in ('member','staff','admin') then raise exception 'unknown role'; end if;
  if uid = auth.uid() and new_role <> 'admin' then raise exception 'you cannot remove your own admin access'; end if;
  update public.profiles set role = new_role where id = uid;
end $$;

-- only signed-in users may call these
revoke all on function public.my_card(), public.choose_tier(text), public.update_my_profile(text,text,date),
  public.staff_lookup(text), public.staff_redeem(text,text,int), public.admin_overview(),
  public.admin_record_payment(uuid,int,text), public.admin_set_member(uuid,text,text), public.admin_set_role(uuid,text) from public, anon;
grant execute on function public.my_card(), public.choose_tier(text), public.update_my_profile(text,text,date),
  public.staff_lookup(text), public.staff_redeem(text,text,int), public.admin_overview(),
  public.admin_record_payment(uuid,int,text), public.admin_set_member(uuid,text,text), public.admin_set_role(uuid,text) to authenticated;
revoke all on function public.handle_new_user(), public.sa_today(), public.period_start(text,date), public.balances(uuid), public.is_active(uuid), public.qr_sign(uuid,bigint), public.qr_check(text), public.role_of(uuid) from public, anon, authenticated;

-- After the first person signs up, make them admin by running (with their email):
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'owner@example.com');
