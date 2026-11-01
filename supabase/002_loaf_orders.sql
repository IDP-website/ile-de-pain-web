-- île de païn · The Island Club · loaf pre-orders
-- Members order loaves at least 2 days ahead, for an open day (Tue to Sat).
-- An order uses that week's loaf allowance. Staff hand it over at the counter.

create table if not exists public.loaf_orders (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  variety text not null,
  qty int not null default 1 check (qty between 1 and 5),
  collect_on date not null,
  status text not null default 'placed' check (status in ('placed','collected','cancelled')),
  created_at timestamptz default now(),
  collected_at timestamptz,
  staff_id uuid references public.profiles
);
create index if not exists loaf_orders_day on public.loaf_orders(collect_on, status);
create index if not exists loaf_orders_user on public.loaf_orders(user_id, collect_on);
alter table public.loaf_orders enable row level security;
drop policy if exists own_orders on public.loaf_orders;
create policy own_orders on public.loaf_orders for select using ((select auth.uid()) = user_id);

alter table public.redemptions add column if not exists order_id bigint references public.loaf_orders on delete set null;

-- the loaves that can be ordered (the IDP Classics)
create or replace function public.loaf_varieties() returns text[] language sql immutable as
$$ select array['Companio','Bagatta','Fougasse','Baguette','100% Vollkorn','100% Rye','100% Organic "O"'] $$;

-- start and end of the period (day, week Tue-Mon, month, year) that contains a given date
create or replace function public.period_bounds(per text, ref date, out s date, out e date)
language plpgsql immutable set search_path = public as $$
begin
  if per = 'day' then s := ref; e := ref + 1;
  elsif per = 'week' then s := ref - ((extract(isodow from ref)::int - 2 + 7) % 7); e := s + 7;
  elsif per = 'month' then s := date_trunc('month', ref)::date; e := (date_trunc('month', ref) + interval '1 month')::date;
  else s := date_trunc('year', ref)::date; e := (date_trunc('year', ref) + interval '1 year')::date;
  end if;
end $$;

-- how many of an item are used in the period containing ref: handed over + still on order
create or replace function public.used_in(uid uuid, it text, per text, ref date) returns int
language sql stable security definer set search_path = public as $$
  with b as (select * from public.period_bounds(per, ref))
  select (select coalesce(sum(qty),0) from public.redemptions r, b
            where r.user_id = uid and r.item = it
              and r.created_at >= (b.s::timestamp at time zone 'Africa/Johannesburg')
              and r.created_at <  (b.e::timestamp at time zone 'Africa/Johannesburg'))::int
       + case when it = 'loaf' then (select coalesce(sum(qty),0) from public.loaf_orders o, b
            where o.user_id = uid and o.status = 'placed' and o.collect_on >= b.s and o.collect_on < b.e)::int else 0 end
$$;

-- balances on any date (today for the card, the collection day for an order)
create or replace function public.balances_on(uid uuid, ref date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare perks jsonb; r jsonb; bday date; used int; left_ int; allow int; res jsonb := '{}'::jsonb; it text;
begin
  select t.perks, p.birthday into perks, bday
    from public.subscriptions s join public.tiers t on t.id = s.tier_id join public.profiles p on p.id = s.user_id
    where s.user_id = uid;
  if perks is null then return res; end if;
  for r in select * from jsonb_array_elements(perks) loop
    it := r->>'item'; allow := (r->>'qty')::int;
    if r->>'per' = 'birthday' and (bday is null or extract(month from bday) <> extract(month from ref)) then allow := 0; end if;
    used := public.used_in(uid, it, case when r->>'per' = 'birthday' then 'year' else r->>'per' end, ref);
    left_ := greatest(allow - used, 0);
    if res ? it then
      if left_ < (res->it->>'left')::int then
        res := jsonb_set(res, array[it], jsonb_build_object('allow', allow, 'used', used, 'left', left_, 'per', r->>'per'));
      end if;
    else
      res := res || jsonb_build_object(it, jsonb_build_object('allow', allow, 'used', used, 'left', left_, 'per', r->>'per'));
    end if;
  end loop;
  return res;
end $$;

create or replace function public.balances(uid uuid) returns jsonb
language sql stable security definer set search_path = public as
$$ select public.balances_on(uid, public.sa_today()) $$;

-- ───── member: place and cancel orders ─────
create or replace function public.place_order(variety text, qty int, collect_on date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s record; left_ int; d date := public.sa_today(); dow int := extract(isodow from collect_on);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.is_active(uid) then return jsonb_build_object('ok', false, 'reason', 'Your membership needs to be active to order.'); end if;
  if not (variety = any(public.loaf_varieties())) then return jsonb_build_object('ok', false, 'reason', 'Please choose one of our classic loaves.'); end if;
  if qty is null or qty < 1 then return jsonb_build_object('ok', false, 'reason', 'Please choose how many.'); end if;
  if collect_on < d + 2 then return jsonb_build_object('ok', false, 'reason', 'Orders need at least 2 days. The earliest you can collect is ' || to_char(d + 2, 'Dy DD Mon') || '.'); end if;
  if collect_on > d + 28 then return jsonb_build_object('ok', false, 'reason', 'You can order up to 4 weeks ahead.'); end if;
  if dow not between 2 and 6 then return jsonb_build_object('ok', false, 'reason', 'We''re open Tuesday to Saturday. Please pick one of those days.'); end if;
  select * into s from public.subscriptions where user_id = uid;
  if s.paid_until < collect_on then return jsonb_build_object('ok', false, 'reason', 'Your membership is paid until ' || to_char(s.paid_until, 'DD Mon') || '. Renew at the counter to order for later dates.'); end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  left_ := coalesce((public.balances_on(uid, collect_on)->'loaf'->>'left')::int, 0);
  if left_ < qty then
    return jsonb_build_object('ok', false, 'reason', case when left_ = 0 then 'You have no loaves left for that week.' else 'You have ' || left_ || ' loaf left for that week.' end);
  end if;
  insert into public.loaf_orders(user_id, variety, qty, collect_on) values (uid, variety, qty, collect_on);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_order(order_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.loaf_orders where id = order_id and user_id = auth.uid();
  if o is null or o.status <> 'placed' then return jsonb_build_object('ok', false, 'reason', 'That order can''t be changed.'); end if;
  if o.collect_on < public.sa_today() + 2 then return jsonb_build_object('ok', false, 'reason', 'Orders can be cancelled up to 2 days before collection. Please chat to us in store.'); end if;
  update public.loaf_orders set status = 'cancelled' where id = order_id;
  return jsonb_build_object('ok', true);
end $$;

-- ───── staff: hand over a pre-order ─────
create or replace function public.staff_collect(token text, order_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; o record;
begin
  if coalesce(public.role_of(auth.uid()),'') not in ('staff','admin') then raise exception 'staff only'; end if;
  uid := public.qr_check(token);
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'This code has expired. Ask the member to open their card again.'); end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into o from public.loaf_orders where id = order_id and user_id = uid;
  if o is null or o.status <> 'placed' then return jsonb_build_object('ok', false, 'reason', 'This order was already handed over or cancelled.'); end if;
  if o.collect_on > public.sa_today() then return jsonb_build_object('ok', false, 'reason', 'This order is for ' || to_char(o.collect_on, 'Dy DD Mon') || '.'); end if;
  update public.loaf_orders set status = 'collected', collected_at = now(), staff_id = auth.uid() where id = order_id;
  insert into public.redemptions(user_id, item, qty, staff_id, order_id) values (uid, 'loaf', o.qty, auth.uid(), order_id);
  return jsonb_build_object('ok', true, 'balances', public.balances(uid));
end $$;

-- ───── card, scanner and dashboard now include orders ─────
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
    'today', public.sa_today(), 'varieties', to_jsonb(public.loaf_varieties()),
    'orders', coalesce((select jsonb_agg(o order by o.collect_on) from (select id, variety, qty, collect_on, status from public.loaf_orders
                where user_id = uid and (status = 'placed' or collect_on >= public.sa_today() - 7) and status <> 'cancelled') o), '[]'::jsonb),
    'token', 'IDPCLUB:' || uid || '.' || win || '.' || public.qr_sign(uid, win),
    'expires_in', 30 - (floor(extract(epoch from now()))::bigint % 30),
    'history', coalesce((select jsonb_agg(h) from (select item, qty, created_at from public.redemptions
                where user_id = uid order by created_at desc limit 30) h), '[]'::jsonb));
end $$;

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
    'paid_until', s.paid_until, 'balances', public.balances(uid),
    'orders', coalesce((select jsonb_agg(o order by o.collect_on) from (select id, variety, qty, collect_on from public.loaf_orders
                where user_id = uid and status = 'placed' and collect_on <= public.sa_today()) o), '[]'::jsonb));
end $$;

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
        select r.item, r.qty, r.created_at, p.full_name, st.full_name as staff, r.order_id
        from public.redemptions r join public.profiles p on p.id = r.user_id left join public.profiles st on st.id = r.staff_id
        where r.created_at >= (public.sa_today()::timestamp at time zone 'Africa/Johannesburg') order by r.created_at desc) x), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(o order by o.collect_on, o.variety) from (
        select o.id, o.variety, o.qty, o.collect_on, o.status, p.full_name, p.phone
        from public.loaf_orders o join public.profiles p on p.id = o.user_id
        where o.status = 'placed' and o.collect_on >= public.sa_today() - 1 and o.collect_on <= public.sa_today() + 28) o), '[]'::jsonb),
    'mrr_cents', coalesce((select sum(t.price_cents) from public.subscriptions s join public.tiers t on t.id = s.tier_id
        where s.status = 'active' and s.paid_until >= public.sa_today()), 0),
    'tiers', (select jsonb_agg(t order by t.sort) from public.tiers t));
end $$;

revoke all on function public.place_order(text,int,date), public.cancel_order(bigint), public.staff_collect(text,bigint) from public, anon;
grant execute on function public.place_order(text,int,date), public.cancel_order(bigint), public.staff_collect(text,bigint) to authenticated;
revoke all on function public.loaf_varieties(), public.period_bounds(text,date), public.used_in(uuid,text,text,date), public.balances_on(uuid,date), public.balances(uuid) from public, anon, authenticated;
