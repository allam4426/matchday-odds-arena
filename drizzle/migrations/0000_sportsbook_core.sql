
-- =========================================================
-- ENUMS
-- =========================================================
create type public.app_role as enum ('super_admin','finance_admin','sports_trader','support_agent','auditor');
create type public.account_status as enum ('active','suspended','self_excluded','closed');
create type public.match_status as enum ('scheduled','live','finished','postponed','cancelled','abandoned');
create type public.market_status as enum ('open','suspended','settled','void');
create type public.selection_result as enum ('pending','won','lost','void');
create type public.bet_status as enum ('open','won','lost','void');
create type public.deposit_status as enum ('pending','under_review','approved','rejected','cancelled');
create type public.withdrawal_status as enum ('requested','pending_review','approved','processing','paid','rejected','cancelled','failed');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- =========================================================
-- PROFILES & ROLES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text,
  full_name text not null,
  phone text,
  country text not null,
  date_of_birth date not null,
  status public.account_status not null default 'active',
  self_excluded_until timestamptz,
  cooling_off_until timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));
create index profiles_status_idx on public.profiles(status);
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;
create or replace function public.can_finance(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('super_admin','finance_admin'))
$$;
create or replace function public.can_trade(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('super_admin','sports_trader'))
$$;

create policy "Users read own profile, staff read all" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "Users update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "Users read own roles, staff read all" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- =========================================================
-- SETTINGS
-- =========================================================
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant select on public.system_settings to anon, authenticated;
grant all on public.system_settings to service_role;
alter table public.system_settings enable row level security;
create policy "Settings are readable" on public.system_settings for select to anon, authenticated using (true);

insert into public.system_settings(key, value) values
  ('currency', '"USD"'),
  ('real_money_enabled', 'false'),
  ('min_deposit_minor', '1000'),
  ('max_deposit_minor', '1000000'),
  ('min_withdrawal_minor', '2000'),
  ('max_withdrawal_minor', '500000'),
  ('min_stake_minor', '100'),
  ('max_stake_minor', '100000'),
  ('max_payout_minor', '5000000'),
  ('max_combo_selections', '12'),
  ('restricted_countries', '[]'),
  ('bank_details', '{"bank_name":"Not configured","account_name":"Not configured","account_number":"Not configured","instructions":"The operator has not configured deposit bank details yet. Do not send money until these details are set."}'),
  ('sports_data_provider', '{"name":null,"status":"not_configured","last_sync_at":null}');

create or replace function public.setting_bigint(_key text) returns bigint
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::bigint from public.system_settings where key = _key
$$;

-- =========================================================
-- SPORTS DATA
-- =========================================================
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'football' check (sport in ('football','futsal')),
  name text not null,
  country text not null,
  sort_order int not null default 100,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.competitions to anon, authenticated;
grant all on public.competitions to service_role;
alter table public.competitions enable row level security;
create policy "Competitions are public" on public.competitions for select to anon, authenticated using (true);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id),
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  minute int,
  home_score int not null default 0,
  away_score int not null default 0,
  ht_home_score int,
  ht_away_score int,
  is_hidden boolean not null default false,
  provenance text not null default 'manual' check (provenance in ('manual','sample','provider')),
  provider_ref text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_status_kickoff_idx on public.matches(status, kickoff_at);
create index matches_competition_idx on public.matches(competition_id);
grant select on public.matches to anon, authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
create policy "Visible matches are public" on public.matches for select to anon, authenticated
  using (not is_hidden or public.is_staff(auth.uid()));
create trigger matches_touch before update on public.matches for each row execute function public.touch_updated_at();

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id),
  key text not null,
  name text not null,
  sort_order int not null default 100,
  status public.market_status not null default 'open',
  settled_at timestamptz,
  settled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, key)
);
create index markets_match_idx on public.markets(match_id);
grant select on public.markets to anon, authenticated;
grant all on public.markets to service_role;
alter table public.markets enable row level security;
create policy "Markets are public" on public.markets for select to anon, authenticated using (true);
create trigger markets_touch before update on public.markets for each row execute function public.touch_updated_at();

create table public.selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id),
  label text not null,
  odds numeric(8,2) not null check (odds >= 1.01 and odds <= 1000),
  result public.selection_result not null default 'pending',
  sort_order int not null default 100,
  updated_at timestamptz not null default now()
);
create index selections_market_idx on public.selections(market_id);
grant select on public.selections to anon, authenticated;
grant all on public.selections to service_role;
alter table public.selections enable row level security;
create policy "Selections are public" on public.selections for select to anon, authenticated using (true);
create trigger selections_touch before update on public.selections for each row execute function public.touch_updated_at();

create table public.odds_history (
  id bigserial primary key,
  selection_id uuid not null references public.selections(id),
  old_odds numeric(8,2),
  new_odds numeric(8,2) not null,
  source text not null default 'manual',
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index odds_history_selection_idx on public.odds_history(selection_id, created_at desc);
grant select on public.odds_history to authenticated;
grant all on public.odds_history to service_role;
alter table public.odds_history enable row level security;
create policy "Staff read odds history" on public.odds_history for select to authenticated using (public.is_staff(auth.uid()));

-- =========================================================
-- WALLET & LEDGER
-- =========================================================
create table public.wallet_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  reserved_minor bigint not null default 0 check (reserved_minor >= 0),
  updated_at timestamptz not null default now()
);
grant select on public.wallet_accounts to authenticated;
grant all on public.wallet_accounts to service_role;
alter table public.wallet_accounts enable row level security;
create policy "Users read own wallet, staff read all" on public.wallet_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.ledger_entries (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id),
  entry_type text not null,
  amount_minor bigint not null,
  reserved_change_minor bigint not null default 0,
  balance_after_minor bigint not null,
  counter_account text not null,
  reference text not null unique,
  description text,
  related_type text,
  related_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger_entries(user_id, created_at desc);
grant select on public.ledger_entries to authenticated;
grant all on public.ledger_entries to service_role;
alter table public.ledger_entries enable row level security;
create policy "Users read own ledger, staff read all" on public.ledger_entries for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.prevent_mutation() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'IMMUTABLE|% records cannot be modified or deleted', tg_table_name; end $$;
create trigger ledger_immutable before update or delete on public.ledger_entries for each row execute function public.prevent_mutation();

-- =========================================================
-- BETS
-- =========================================================
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles(id),
  bet_type text not null check (bet_type in ('single','combo')),
  stake_minor bigint not null check (stake_minor > 0),
  total_odds numeric(12,2) not null,
  potential_return_minor bigint not null,
  status public.bet_status not null default 'open',
  payout_minor bigint not null default 0,
  void_reason text,
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);
create index bets_user_idx on public.bets(user_id, placed_at desc);
create index bets_status_idx on public.bets(status);
grant select on public.bets to authenticated;
grant all on public.bets to service_role;
alter table public.bets enable row level security;
create policy "Users read own bets, staff read all" on public.bets for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.bet_selections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets(id),
  selection_id uuid not null references public.selections(id),
  market_id uuid not null references public.markets(id),
  match_id uuid not null references public.matches(id),
  odds_accepted numeric(8,2) not null,
  match_label text not null,
  market_name text not null,
  selection_label text not null,
  result public.selection_result not null default 'pending'
);
create index bet_selections_bet_idx on public.bet_selections(bet_id);
create index bet_selections_market_idx on public.bet_selections(market_id);
grant select on public.bet_selections to authenticated;
grant all on public.bet_selections to service_role;
alter table public.bet_selections enable row level security;
create policy "Read selections of readable bets" on public.bet_selections for select to authenticated
  using (exists (select 1 from public.bets b where b.id = bet_id and (b.user_id = auth.uid() or public.is_staff(auth.uid()))));

-- =========================================================
-- DEPOSITS & WITHDRAWALS
-- =========================================================
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DEP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  user_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  bank_reference text not null,
  slip_path text not null,
  user_note text,
  status public.deposit_status not null default 'pending',
  flagged_duplicate boolean not null default false,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index deposits_user_idx on public.deposits(user_id, created_at desc);
create index deposits_status_idx on public.deposits(status, created_at desc);
create index deposits_bank_ref_idx on public.deposits(lower(bank_reference));
grant select on public.deposits to authenticated;
grant all on public.deposits to service_role;
alter table public.deposits enable row level security;
create policy "Users read own deposits, staff read all" on public.deposits for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('WDR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  user_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  status public.withdrawal_status not null default 'pending_review',
  payment_reference text,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index withdrawals_user_idx on public.withdrawals(user_id, created_at desc);
create index withdrawals_status_idx on public.withdrawals(status, created_at desc);
grant select on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;
alter table public.withdrawals enable row level security;
create policy "Users read own withdrawals, staff read all" on public.withdrawals for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));
create trigger withdrawals_touch before update on public.withdrawals for each row execute function public.touch_updated_at();

-- =========================================================
-- RESPONSIBLE GAMBLING, NOTIFICATIONS, AUDIT
-- =========================================================
create table public.rg_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_deposit_limit_minor bigint check (daily_deposit_limit_minor is null or daily_deposit_limit_minor > 0),
  weekly_deposit_limit_minor bigint check (weekly_deposit_limit_minor is null or weekly_deposit_limit_minor > 0),
  daily_stake_limit_minor bigint check (daily_stake_limit_minor is null or daily_stake_limit_minor > 0),
  session_reminder_minutes int not null default 60 check (session_reminder_minutes between 0 and 480),
  updated_at timestamptz not null default now()
);
grant select on public.rg_limits to authenticated;
grant all on public.rg_limits to service_role;
alter table public.rg_limits enable row level security;
create policy "Users read own limits, staff read all" on public.rg_limits for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Users mark own notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.admin_audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.admin_audit_logs(created_at desc);
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;
alter table public.admin_audit_logs enable row level security;
create policy "Staff read audit log" on public.admin_audit_logs for select to authenticated using (public.is_staff(auth.uid()));
create trigger audit_immutable before update or delete on public.admin_audit_logs for each row execute function public.prevent_mutation();

-- =========================================================
-- INTERNAL HELPERS
-- =========================================================
create or replace function public._audit(_action text, _entity_type text, _entity_id text, _details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), _action, _entity_type, _entity_id, coalesce(_details, '{}'::jsonb));
$$;

create or replace function public._notify(_user uuid, _kind text, _title text, _body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, kind, title, body) values (_user, _kind, _title, _body);
$$;

create or replace function public._post_ledger(
  _user uuid, _type text, _amount bigint, _reserved bigint, _reference text,
  _description text, _related_type text, _related_id uuid, _counter text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_bal bigint; v_res bigint;
begin
  if exists (select 1 from public.ledger_entries where reference = _reference) then
    raise exception 'DUPLICATE|This transaction (%) has already been posted', _reference;
  end if;
  update public.wallet_accounts
     set balance_minor = balance_minor + _amount,
         reserved_minor = reserved_minor + _reserved,
         updated_at = now()
   where user_id = _user
   returning balance_minor, reserved_minor into v_bal, v_res;
  if not found then raise exception 'NO_WALLET|Wallet not found'; end if;
  if v_bal < 0 then raise exception 'INSUFFICIENT_FUNDS|Insufficient available balance'; end if;
  if v_res < 0 then raise exception 'LEDGER_ERROR|Reserved balance cannot go below zero'; end if;
  insert into public.ledger_entries(user_id, entry_type, amount_minor, reserved_change_minor, balance_after_minor,
    counter_account, reference, description, related_type, related_id, created_by)
  values (_user, _type, _amount, _reserved, v_bal, _counter, _reference, _description, _related_type, _related_id, auth.uid());
  return v_bal;
end $$;

create or replace function public._assert_active(_user uuid, _for_betting boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
  if _user is null then raise exception 'AUTH|Please sign in to continue'; end if;
  select * into p from public.profiles where id = _user;
  if not found then raise exception 'AUTH|Account profile not found'; end if;
  if p.status in ('suspended','closed') then raise exception 'ACCOUNT_RESTRICTED|Your account is %. Contact support.', p.status; end if;
  if _for_betting and p.self_excluded_until is not null and p.self_excluded_until > now() then
    raise exception 'SELF_EXCLUDED|You are self-excluded until %', to_char(p.self_excluded_until, 'DD Mon YYYY');
  end if;
  if _for_betting and p.cooling_off_until is not null and p.cooling_off_until > now() then
    raise exception 'COOLING_OFF|You are on a cooling-off break until %', to_char(p.cooling_off_until, 'DD Mon YYYY HH24:MI');
  end if;
end $$;

create or replace function public._create_match_markets(_match uuid, _h numeric, _d numeric, _a numeric, _open_derived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m uuid; s numeric; qh numeric; qd numeric; qa numeric; st public.market_status;
begin
  s := 1/_h + 1/_d + 1/_a; qh := (1/_h)/s; qd := (1/_d)/s; qa := (1/_a)/s;
  st := case when _open_derived then 'open'::public.market_status else 'suspended'::public.market_status end;

  insert into public.markets(match_id, key, name, sort_order) values (_match, '1x2', 'Match Result', 1) returning id into m;
  insert into public.selections(market_id, label, odds, sort_order) values (m, '1', _h, 1), (m, 'X', _d, 2), (m, '2', _a, 3);

  insert into public.markets(match_id, key, name, sort_order, status) values (_match, 'dc', 'Double Chance', 2, st) returning id into m;
  insert into public.selections(market_id, label, odds, sort_order) values
    (m, '1X', greatest(1.01, round(1/((qh+qd)*1.06), 2)), 1),
    (m, '12', greatest(1.01, round(1/((qh+qa)*1.06), 2)), 2),
    (m, 'X2', greatest(1.01, round(1/((qd+qa)*1.06), 2)), 3);

  insert into public.markets(match_id, key, name, sort_order, status) values (_match, 'ou25', 'Total Goals 2.5', 3, st) returning id into m;
  insert into public.selections(market_id, label, odds, sort_order) values (m, 'Over 2.5', 1.85, 1), (m, 'Under 2.5', 1.95, 2);

  insert into public.markets(match_id, key, name, sort_order, status) values (_match, 'btts', 'Both Teams To Score', 4, st) returning id into m;
  insert into public.selections(market_id, label, odds, sort_order) values (m, 'Yes', 1.80, 1), (m, 'No', 1.95, 2);
end $$;

create or replace function public._settle_bet(_bet uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bets%rowtype; v_lost boolean; v_pending boolean; v_all_void boolean;
        v_odds numeric := 1; r record; v_payout bigint; v_max bigint;
begin
  select * into b from public.bets where id = _bet for update;
  if not found or b.status <> 'open' then return; end if;
  select bool_or(result = 'lost'), bool_or(result = 'pending'), bool_and(result = 'void')
    into v_lost, v_pending, v_all_void from public.bet_selections where bet_id = _bet;
  if v_lost then
    update public.bets set status = 'lost', payout_minor = 0, settled_at = now() where id = _bet;
    perform public._notify(b.user_id, 'bet', 'Bet settled: lost', 'Bet ' || b.reference || ' did not win.');
    return;
  end if;
  if v_pending then return; end if;
  if v_all_void then
    v_payout := b.stake_minor;
    update public.bets set status = 'void', payout_minor = v_payout, settled_at = now() where id = _bet;
    perform public._post_ledger(b.user_id, 'bet_refund', v_payout, 0, 'SETTLE-' || b.id, 'Stake returned (void) ' || b.reference, 'bet', b.id, 'house:bets');
    perform public._notify(b.user_id, 'bet', 'Bet voided', 'Your stake for bet ' || b.reference || ' was returned.');
  else
    for r in select odds_accepted from public.bet_selections where bet_id = _bet and result = 'won' loop
      v_odds := v_odds * r.odds_accepted;
    end loop;
    v_max := coalesce(public.setting_bigint('max_payout_minor'), 9223372036854775807);
    v_payout := least(floor(b.stake_minor * round(v_odds, 2))::bigint, v_max);
    update public.bets set status = 'won', payout_minor = v_payout, settled_at = now() where id = _bet;
    perform public._post_ledger(b.user_id, 'bet_payout', v_payout, 0, 'SETTLE-' || b.id, 'Winnings for ' || b.reference, 'bet', b.id, 'house:bets');
    perform public._notify(b.user_id, 'bet', 'Bet won!', 'Bet ' || b.reference || ' won. Returns have been credited to your wallet.');
  end if;
end $$;

-- =========================================================
-- SIGNUP
-- =========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_dob date; v_country text; v_restricted jsonb;
begin
  v_dob := nullif(v_meta->>'date_of_birth','')::date;
  v_country := upper(coalesce(nullif(v_meta->>'country',''), 'XX'));
  if v_dob is null then raise exception 'Date of birth is required'; end if;
  if v_dob > (current_date - interval '18 years') then raise exception 'You must be at least 18 years old'; end if;
  select value into v_restricted from public.system_settings where key = 'restricted_countries';
  if v_restricted is not null and v_restricted ? v_country then raise exception 'Registration is not available in your country'; end if;

  insert into public.profiles(id, username, email, full_name, phone, country, date_of_birth)
  values (new.id,
          coalesce(nullif(v_meta->>'username',''), 'user_' || substr(new.id::text, 1, 8)),
          new.email,
          coalesce(nullif(v_meta->>'full_name',''), 'Unknown'),
          nullif(v_meta->>'phone',''),
          v_country, v_dob);
  insert into public.wallet_accounts(user_id) values (new.id);
  insert into public.rg_limits(user_id) values (new.id);
  insert into public.notifications(user_id, kind, title, body)
  values (new.id, 'account', 'Welcome!', 'Your account has been created. Set your responsible gambling limits any time from your account page.');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.username_available(_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(_username)))
$$;

-- =========================================================
-- USER RPCs
-- =========================================================
create or replace function public.place_bet(_bet_type text, _items jsonb, _stake_minor bigint, _accept_odds_changes boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_item jsonb; r record;
        v_total numeric := 1; v_matches uuid[] := '{}'; v_changed jsonb := '[]'::jsonb;
        v_bet uuid; v_ref text; v_potential bigint; v_max_payout bigint; v_daily bigint; v_today bigint;
        v_rows jsonb := '[]'::jsonb;
begin
  perform public._assert_active(v_user, true);
  if _bet_type not in ('single','combo') then raise exception 'INVALID|Unknown bet type'; end if;
  v_count := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  if _bet_type = 'single' and v_count <> 1 then raise exception 'INVALID|A single bet needs exactly one selection'; end if;
  if _bet_type = 'combo' and (v_count < 2 or v_count > coalesce(public.setting_bigint('max_combo_selections'), 12)) then
    raise exception 'INVALID|A combo bet needs between 2 and % selections', coalesce(public.setting_bigint('max_combo_selections'), 12);
  end if;
  if _stake_minor is null or _stake_minor < coalesce(public.setting_bigint('min_stake_minor'), 1) then
    raise exception 'STAKE_TOO_LOW|Stake is below the minimum';
  end if;
  if _stake_minor > coalesce(public.setting_bigint('max_stake_minor'), 9223372036854775807) then
    raise exception 'STAKE_TOO_HIGH|Stake is above the maximum';
  end if;

  for v_item in select * from jsonb_array_elements(_items) loop
    select s.id, s.label, s.odds, s.result, mk.id as market_id, mk.name as market_name, mk.status as market_status,
           mt.id as match_id, mt.status as match_status, mt.kickoff_at, mt.is_hidden, mt.home_team, mt.away_team
      into r
      from public.selections s
      join public.markets mk on mk.id = s.market_id
      join public.matches mt on mt.id = mk.match_id
     where s.id = (v_item->>'selection_id')::uuid
     for share of s, mk, mt;
    if not found then raise exception 'NOT_FOUND|A selection no longer exists'; end if;
    if r.is_hidden or r.match_status not in ('scheduled','live') then
      raise exception 'MARKET_CLOSED|% v % is not open for betting', r.home_team, r.away_team;
    end if;
    if r.match_status = 'scheduled' and r.kickoff_at <= now() then
      raise exception 'MARKET_CLOSED|% v % has kicked off; prematch betting is closed', r.home_team, r.away_team;
    end if;
    if r.market_status <> 'open' or r.result <> 'pending' then
      raise exception 'MARKET_SUSPENDED|% (% v %) is suspended', r.market_name, r.home_team, r.away_team;
    end if;
    if r.match_id = any(v_matches) then raise exception 'SAME_MATCH|Combo selections must come from different matches'; end if;
    v_matches := v_matches || r.match_id;
    if r.odds <> (v_item->>'odds')::numeric then
      v_changed := v_changed || jsonb_build_object('selection_id', r.id, 'odds', r.odds);
    end if;
    v_total := v_total * r.odds;
    v_rows := v_rows || jsonb_build_object('selection_id', r.id, 'market_id', r.market_id, 'match_id', r.match_id,
      'odds', r.odds, 'match_label', r.home_team || ' v ' || r.away_team, 'market_name', r.market_name, 'label', r.label);
  end loop;

  if jsonb_array_length(v_changed) > 0 and not _accept_odds_changes then
    raise exception 'ODDS_CHANGED|%', v_changed::text;
  end if;

  v_daily := (select daily_stake_limit_minor from public.rg_limits where user_id = v_user);
  if v_daily is not null then
    select coalesce(sum(stake_minor), 0) into v_today from public.bets where user_id = v_user and placed_at >= date_trunc('day', now());
    if v_today + _stake_minor > v_daily then raise exception 'LIMIT_REACHED|This stake exceeds your daily stake limit'; end if;
  end if;

  v_total := round(v_total, 2);
  v_max_payout := coalesce(public.setting_bigint('max_payout_minor'), 9223372036854775807);
  v_potential := least(floor(_stake_minor * v_total)::bigint, v_max_payout);
  v_ref := 'B' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.bets(reference, user_id, bet_type, stake_minor, total_odds, potential_return_minor)
  values (v_ref, v_user, _bet_type, _stake_minor, v_total, v_potential) returning id into v_bet;

  insert into public.bet_selections(bet_id, selection_id, market_id, match_id, odds_accepted, match_label, market_name, selection_label)
  select v_bet, (x->>'selection_id')::uuid, (x->>'market_id')::uuid, (x->>'match_id')::uuid, (x->>'odds')::numeric,
         x->>'match_label', x->>'market_name', x->>'label'
    from jsonb_array_elements(v_rows) x;

  perform public._post_ledger(v_user, 'bet_stake', -_stake_minor, 0, 'STAKE-' || v_bet, 'Stake for ' || v_ref, 'bet', v_bet, 'house:bets');
  perform public._notify(v_user, 'bet', 'Bet accepted', 'Bet ' || v_ref || ' was accepted at odds ' || v_total || '.');
  return jsonb_build_object('bet_id', v_bet, 'reference', v_ref, 'total_odds', v_total, 'potential_return_minor', v_potential);
end $$;

create or replace function public.submit_deposit(_amount_minor bigint, _bank_reference text, _slip_path text, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_dup boolean; l public.rg_limits%rowtype; v_sum bigint;
begin
  perform public._assert_active(v_user, true);
  if _amount_minor < coalesce(public.setting_bigint('min_deposit_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum deposit'; end if;
  if _amount_minor > coalesce(public.setting_bigint('max_deposit_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum deposit'; end if;
  if coalesce(trim(_bank_reference), '') = '' or length(_bank_reference) > 100 then raise exception 'INVALID|Enter the bank transfer reference'; end if;
  if _slip_path is null or split_part(_slip_path, '/', 1) <> v_user::text then raise exception 'INVALID|Upload your payment slip'; end if;

  select * into l from public.rg_limits where user_id = v_user;
  if l.daily_deposit_limit_minor is not null then
    select coalesce(sum(amount_minor),0) into v_sum from public.deposits
     where user_id = v_user and status in ('pending','under_review','approved') and created_at >= date_trunc('day', now());
    if v_sum + _amount_minor > l.daily_deposit_limit_minor then raise exception 'LIMIT_REACHED|This exceeds your daily deposit limit'; end if;
  end if;
  if l.weekly_deposit_limit_minor is not null then
    select coalesce(sum(amount_minor),0) into v_sum from public.deposits
     where user_id = v_user and status in ('pending','under_review','approved') and created_at >= now() - interval '7 days';
    if v_sum + _amount_minor > l.weekly_deposit_limit_minor then raise exception 'LIMIT_REACHED|This exceeds your weekly deposit limit'; end if;
  end if;

  select exists (select 1 from public.deposits where lower(bank_reference) = lower(trim(_bank_reference)) and status <> 'cancelled') into v_dup;
  insert into public.deposits(user_id, amount_minor, bank_reference, slip_path, user_note, flagged_duplicate)
  values (v_user, _amount_minor, trim(_bank_reference), _slip_path, nullif(trim(coalesce(_note,'')), ''), v_dup)
  returning id into v_id;
  perform public._notify(v_user, 'deposit', 'Deposit submitted', 'Your deposit request is pending verification. Funds are credited only after the transfer is confirmed.');
  return v_id;
end $$;

create or replace function public.cancel_deposit(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.deposits set status = 'cancelled' where id = _id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'INVALID|Only pending deposits can be cancelled'; end if;
end $$;

create or replace function public.request_withdrawal(_amount_minor bigint, _bank_name text, _account_name text, _account_number text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  perform public._assert_active(v_user, false);
  if _amount_minor < coalesce(public.setting_bigint('min_withdrawal_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum withdrawal'; end if;
  if _amount_minor > coalesce(public.setting_bigint('max_withdrawal_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum withdrawal'; end if;
  if coalesce(trim(_bank_name),'') = '' or coalesce(trim(_account_name),'') = '' or length(regexp_replace(coalesce(_account_number,''), '\s', '', 'g')) < 4 then
    raise exception 'INVALID|Enter complete bank account details';
  end if;
  insert into public.withdrawals(user_id, amount_minor, bank_name, account_name, account_number)
  values (v_user, _amount_minor, trim(_bank_name), trim(_account_name), regexp_replace(_account_number, '\s', '', 'g'))
  returning id into v_id;
  perform public._post_ledger(v_user, 'withdrawal_reserve', -_amount_minor, _amount_minor, 'WDR-RES-' || v_id,
    'Funds reserved for withdrawal', 'withdrawal', v_id, 'reserve:withdrawals');
  perform public._notify(v_user, 'withdrawal', 'Withdrawal requested', 'Your withdrawal is pending review. The amount has been reserved from your balance.');
  return v_id;
end $$;

create or replace function public.cancel_withdrawal(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawals%rowtype;
begin
  select * into w from public.withdrawals where id = _id and user_id = auth.uid() for update;
  if not found or w.status not in ('requested','pending_review') then raise exception 'INVALID|This withdrawal can no longer be cancelled'; end if;
  update public.withdrawals set status = 'cancelled' where id = _id;
  perform public._post_ledger(w.user_id, 'withdrawal_release', w.amount_minor, -w.amount_minor, 'WDR-REL-' || w.id,
    'Withdrawal cancelled, funds released', 'withdrawal', w.id, 'reserve:withdrawals');
end $$;

create or replace function public.wallet_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'available_minor', coalesce((select balance_minor from public.wallet_accounts where user_id = auth.uid()), 0),
    'reserved_minor', coalesce((select reserved_minor from public.wallet_accounts where user_id = auth.uid()), 0),
    'pending_deposits_minor', coalesce((select sum(amount_minor) from public.deposits where user_id = auth.uid() and status in ('pending','under_review')), 0),
    'pending_withdrawals_minor', coalesce((select sum(amount_minor) from public.withdrawals where user_id = auth.uid() and status in ('requested','pending_review','approved','processing')), 0),
    'total_deposits_minor', coalesce((select sum(amount_minor) from public.deposits where user_id = auth.uid() and status = 'approved'), 0),
    'total_withdrawals_minor', coalesce((select sum(amount_minor) from public.withdrawals where user_id = auth.uid() and status = 'paid'), 0),
    'open_stakes_minor', coalesce((select sum(stake_minor) from public.bets where user_id = auth.uid() and status = 'open'), 0),
    'net_winnings_minor', coalesce((select sum(payout_minor - stake_minor) from public.bets where user_id = auth.uid() and status = 'won'), 0)
  )
$$;

create or replace function public.set_rg_limits(_daily_deposit bigint, _weekly_deposit bigint, _daily_stake bigint, _reminder_minutes int)
returns void language plpgsql security definer set search_path = public as $$
declare l public.rg_limits%rowtype; v_raising boolean;
begin
  if auth.uid() is null then raise exception 'AUTH|Please sign in'; end if;
  select * into l from public.rg_limits where user_id = auth.uid() for update;
  v_raising := (l.daily_deposit_limit_minor is not null and (_daily_deposit is null or _daily_deposit > l.daily_deposit_limit_minor))
            or (l.weekly_deposit_limit_minor is not null and (_weekly_deposit is null or _weekly_deposit > l.weekly_deposit_limit_minor))
            or (l.daily_stake_limit_minor is not null and (_daily_stake is null or _daily_stake > l.daily_stake_limit_minor));
  if v_raising and l.updated_at > now() - interval '24 hours' then
    raise exception 'COOLDOWN|Limits can only be raised or removed 24 hours after your last change. Lowering is always immediate.';
  end if;
  update public.rg_limits set daily_deposit_limit_minor = _daily_deposit, weekly_deposit_limit_minor = _weekly_deposit,
    daily_stake_limit_minor = _daily_stake, session_reminder_minutes = coalesce(_reminder_minutes, 60), updated_at = now()
   where user_id = auth.uid();
end $$;

create or replace function public.self_exclude(_days int)
returns void language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH|Please sign in'; end if;
  if _days not in (180, 365, 1825) then raise exception 'INVALID|Choose 6 months, 1 year or 5 years'; end if;
  v_until := now() + make_interval(days => _days);
  update public.profiles set status = 'self_excluded',
    self_excluded_until = greatest(coalesce(self_excluded_until, v_until), v_until)
   where id = auth.uid();
  perform public._notify(auth.uid(), 'account', 'Self-exclusion active', 'Betting and deposits are blocked until ' || to_char(v_until, 'DD Mon YYYY') || '. You can still withdraw your balance.');
end $$;

create or replace function public.take_break(_hours int)
returns void language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH|Please sign in'; end if;
  if _hours not in (24, 72, 168, 720) then raise exception 'INVALID|Choose 24 hours, 3 days, 7 days or 30 days'; end if;
  v_until := now() + make_interval(hours => _hours);
  update public.profiles set cooling_off_until = greatest(coalesce(cooling_off_until, v_until), v_until) where id = auth.uid();
end $$;

-- =========================================================
-- ADMIN RPCs
-- =========================================================
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'super_admin')
$$;

create or replace function public.claim_first_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH|Please sign in'; end if;
  perform pg_advisory_xact_lock(424242);
  if exists (select 1 from public.user_roles where role = 'super_admin') then
    raise exception 'FORBIDDEN|An administrator already exists. Ask them to grant you a role.';
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'super_admin');
  perform public._audit('claim_first_admin', 'user', auth.uid()::text, '{}'::jsonb);
end $$;

create or replace function public.admin_set_role(_user uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN|Super admin only'; end if;
  if _grant then
    insert into public.user_roles(user_id, role) values (_user, _role) on conflict do nothing;
  else
    if _role = 'super_admin' and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
      raise exception 'INVALID|Cannot remove the last super admin';
    end if;
    delete from public.user_roles where user_id = _user and role = _role;
  end if;
  perform public._audit(case when _grant then 'grant_role' else 'revoke_role' end, 'user', _user::text, jsonb_build_object('role', _role));
end $$;

create or replace function public.admin_set_user_status(_user uuid, _status public.account_status, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'support_agent')) then raise exception 'FORBIDDEN|Not permitted'; end if;
  if coalesce(trim(_note), '') = '' then raise exception 'INVALID|A reason is required'; end if;
  if _status = 'self_excluded' then raise exception 'INVALID|Self-exclusion can only be set by the customer'; end if;
  update public.profiles set status = _status, admin_note = _note where id = _user;
  perform public._audit('set_user_status', 'user', _user::text, jsonb_build_object('status', _status, 'note', _note));
  perform public._notify(_user, 'account', 'Account status updated', 'Your account status is now: ' || _status || '.');
end $$;

create or replace function public.admin_update_setting(_key text, _value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN|Super admin only'; end if;
  select value into v_old from public.system_settings where key = _key;
  insert into public.system_settings(key, value, updated_by, updated_at) values (_key, _value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public._audit('update_setting', 'setting', _key, jsonb_build_object('old', v_old, 'new', _value));
end $$;

create or replace function public.admin_review_deposit(_id uuid, _decision text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deposits%rowtype;
begin
  if not public.can_finance(auth.uid()) then raise exception 'FORBIDDEN|Finance permission required'; end if;
  select * into d from public.deposits where id = _id for update;
  if not found then raise exception 'NOT_FOUND|Deposit not found'; end if;
  if d.status not in ('pending','under_review') then raise exception 'INVALID|This deposit has already been %', d.status; end if;
  if _decision = 'under_review' then
    update public.deposits set status = 'under_review', review_note = coalesce(nullif(trim(_note),''), review_note), reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  elsif _decision = 'approve' then
    update public.deposits set status = 'approved', review_note = nullif(trim(_note),''), reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
    perform public._post_ledger(d.user_id, 'deposit', d.amount_minor, 0, 'DEP-' || d.id, 'Bank transfer deposit ' || d.reference, 'deposit', d.id, 'house:bank');
    perform public._notify(d.user_id, 'deposit', 'Deposit approved', 'Deposit ' || d.reference || ' has been verified and credited to your wallet.');
  elsif _decision = 'reject' then
    if coalesce(trim(_note), '') = '' then raise exception 'INVALID|A rejection reason is required'; end if;
    update public.deposits set status = 'rejected', review_note = trim(_note), reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
    perform public._notify(d.user_id, 'deposit', 'Deposit rejected', 'Deposit ' || d.reference || ' was rejected: ' || trim(_note));
  else
    raise exception 'INVALID|Unknown decision';
  end if;
  perform public._audit('deposit_' || _decision, 'deposit', _id::text, jsonb_build_object('note', _note, 'amount_minor', d.amount_minor));
end $$;

create or replace function public.admin_update_withdrawal(_id uuid, _status public.withdrawal_status, _payment_reference text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawals%rowtype; v_ok boolean;
begin
  if not public.can_finance(auth.uid()) then raise exception 'FORBIDDEN|Finance permission required'; end if;
  select * into w from public.withdrawals where id = _id for update;
  if not found then raise exception 'NOT_FOUND|Withdrawal not found'; end if;
  v_ok := (w.status in ('requested','pending_review') and _status in ('approved','rejected'))
       or (w.status = 'approved' and _status in ('processing','rejected'))
       or (w.status = 'processing' and _status in ('paid','failed'));
  if not v_ok then raise exception 'INVALID|Cannot move a withdrawal from % to %', w.status, _status; end if;
  if _status in ('rejected','failed') and coalesce(trim(_note),'') = '' then raise exception 'INVALID|A reason is required'; end if;
  if _status = 'paid' and coalesce(trim(_payment_reference),'') = '' then raise exception 'INVALID|A bank payment confirmation reference is required to mark as paid'; end if;

  update public.withdrawals set status = _status,
    payment_reference = coalesce(nullif(trim(_payment_reference),''), payment_reference),
    review_note = coalesce(nullif(trim(_note),''), review_note),
    reviewed_by = auth.uid(), reviewed_at = now(),
    paid_at = case when _status = 'paid' then now() else paid_at end
   where id = _id;

  if _status in ('rejected','failed') then
    perform public._post_ledger(w.user_id, 'withdrawal_release', w.amount_minor, -w.amount_minor, 'WDR-REL-' || w.id,
      'Withdrawal ' || _status || ', funds released', 'withdrawal', w.id, 'reserve:withdrawals');
  elsif _status = 'paid' then
    perform public._post_ledger(w.user_id, 'withdrawal_paid', 0, -w.amount_minor, 'WDR-PAID-' || w.id,
      'Withdrawal paid, ref ' || trim(_payment_reference), 'withdrawal', w.id, 'house:bank');
  end if;
  perform public._notify(w.user_id, 'withdrawal', 'Withdrawal ' || _status,
    'Withdrawal ' || w.reference || ' is now ' || _status || coalesce('. ' || nullif(trim(_note),''), '') || '.');
  perform public._audit('withdrawal_' || _status, 'withdrawal', _id::text, jsonb_build_object('note', _note, 'payment_reference', _payment_reference, 'amount_minor', w.amount_minor));
end $$;

create or replace function public.admin_create_match(_competition uuid, _home text, _away text, _kickoff timestamptz, _h numeric, _d numeric, _a numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  if coalesce(trim(_home),'') = '' or coalesce(trim(_away),'') = '' then raise exception 'INVALID|Team names are required'; end if;
  if _h < 1.01 or _d < 1.01 or _a < 1.01 then raise exception 'INVALID|Odds must be at least 1.01'; end if;
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance, created_by)
  values (_competition, trim(_home), trim(_away), _kickoff, 'manual', auth.uid()) returning id into v_id;
  perform public._create_match_markets(v_id, _h, _d, _a, false);
  perform public._audit('create_match', 'match', v_id::text, jsonb_build_object('home', _home, 'away', _away, 'kickoff', _kickoff));
  return v_id;
end $$;

create or replace function public.admin_update_match(_id uuid, _status public.match_status, _minute int, _home_score int, _away_score int, _ht_home int, _ht_away int, _hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.matches%rowtype;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  select * into m from public.matches where id = _id for update;
  if not found then raise exception 'NOT_FOUND|Match not found'; end if;
  update public.matches set status = _status, minute = _minute, home_score = coalesce(_home_score, 0), away_score = coalesce(_away_score, 0),
    ht_home_score = _ht_home, ht_away_score = _ht_away, is_hidden = coalesce(_hidden, false)
   where id = _id;
  if _status in ('finished','postponed','cancelled','abandoned') then
    update public.markets set status = 'suspended' where match_id = _id and status = 'open';
  end if;
  perform public._audit('update_match', 'match', _id::text, jsonb_build_object(
    'before', jsonb_build_object('status', m.status, 'score', m.home_score || '-' || m.away_score, 'hidden', m.is_hidden),
    'after', jsonb_build_object('status', _status, 'score', coalesce(_home_score,0) || '-' || coalesce(_away_score,0), 'minute', _minute, 'hidden', _hidden)));
end $$;

create or replace function public.admin_set_odds(_selection uuid, _odds numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_old numeric;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  if _odds < 1.01 or _odds > 1000 then raise exception 'INVALID|Odds must be between 1.01 and 1000'; end if;
  select odds into v_old from public.selections where id = _selection for update;
  if not found then raise exception 'NOT_FOUND|Selection not found'; end if;
  if v_old = round(_odds, 2) then return; end if;
  update public.selections set odds = round(_odds, 2) where id = _selection;
  insert into public.odds_history(selection_id, old_odds, new_odds, source, changed_by) values (_selection, v_old, round(_odds, 2), 'manual', auth.uid());
end $$;

create or replace function public.admin_set_market_status(_market uuid, _status public.market_status)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.market_status;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  if _status not in ('open','suspended') then raise exception 'INVALID|Use settlement to close a market'; end if;
  select status into v_old from public.markets where id = _market for update;
  if v_old in ('settled','void') then raise exception 'INVALID|Market is already settled'; end if;
  update public.markets set status = _status where id = _market;
  perform public._audit('market_' || _status, 'market', _market::text, jsonb_build_object('from', v_old));
end $$;

create or replace function public.admin_settle_market(_market uuid, _winners uuid[], _void boolean)
returns int language plpgsql security definer set search_path = public as $$
declare mk public.markets%rowtype; v_bet uuid; v_count int := 0;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  select * into mk from public.markets where id = _market for update;
  if not found then raise exception 'NOT_FOUND|Market not found'; end if;
  if mk.status in ('settled','void') then raise exception 'ALREADY_SETTLED|This market has already been settled'; end if;
  if not _void and coalesce(array_length(_winners, 1), 0) = 0 then raise exception 'INVALID|Choose the winning selection'; end if;

  if _void then
    update public.selections set result = 'void' where market_id = _market;
    update public.markets set status = 'void', settled_at = now(), settled_by = auth.uid() where id = _market;
  else
    update public.selections set result = case when id = any(_winners) then 'won'::public.selection_result else 'lost'::public.selection_result end where market_id = _market;
    update public.markets set status = 'settled', settled_at = now(), settled_by = auth.uid() where id = _market;
  end if;

  update public.bet_selections bs set result = s.result from public.selections s where bs.selection_id = s.id and bs.market_id = _market;

  for v_bet in select distinct b.id from public.bets b join public.bet_selections bs on bs.bet_id = b.id where bs.market_id = _market and b.status = 'open' loop
    perform public._settle_bet(v_bet);
    v_count := v_count + 1;
  end loop;
  perform public._audit(case when _void then 'void_market' else 'settle_market' end, 'market', _market::text, jsonb_build_object('winners', _winners, 'bets_processed', v_count));
  return v_count;
end $$;

create or replace function public.admin_void_bet(_bet uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bets%rowtype;
begin
  if not public.can_trade(auth.uid()) then raise exception 'FORBIDDEN|Trading permission required'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'INVALID|A reason is required'; end if;
  select * into b from public.bets where id = _bet for update;
  if not found then raise exception 'NOT_FOUND|Bet not found'; end if;
  if b.status <> 'open' then raise exception 'INVALID|Only open bets can be voided'; end if;
  update public.bets set status = 'void', payout_minor = b.stake_minor, settled_at = now(), void_reason = trim(_reason) where id = _bet;
  update public.bet_selections set result = 'void' where bet_id = _bet and result = 'pending';
  perform public._post_ledger(b.user_id, 'bet_refund', b.stake_minor, 0, 'SETTLE-' || b.id, 'Bet voided: ' || trim(_reason), 'bet', b.id, 'house:bets');
  perform public._notify(b.user_id, 'bet', 'Bet voided', 'Bet ' || b.reference || ' was voided and your stake returned. Reason: ' || trim(_reason));
  perform public._audit('void_bet', 'bet', _bet::text, jsonb_build_object('reason', _reason, 'stake_minor', b.stake_minor));
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN|Staff only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where status = 'active'),
    'restricted_users', (select count(*) from public.profiles where status <> 'active'),
    'pending_deposits', (select count(*) from public.deposits where status in ('pending','under_review')),
    'pending_deposits_minor', (select coalesce(sum(amount_minor),0) from public.deposits where status in ('pending','under_review')),
    'flagged_deposits', (select count(*) from public.deposits where flagged_duplicate and status in ('pending','under_review')),
    'pending_withdrawals', (select count(*) from public.withdrawals where status in ('requested','pending_review','approved','processing')),
    'pending_withdrawals_minor', (select coalesce(sum(amount_minor),0) from public.withdrawals where status in ('requested','pending_review','approved','processing')),
    'live_matches', (select count(*) from public.matches where status = 'live'),
    'upcoming_matches', (select count(*) from public.matches where status = 'scheduled' and kickoff_at > now()),
    'suspended_markets', (select count(*) from public.markets mk join public.matches m on m.id = mk.match_id where mk.status = 'suspended' and m.status in ('scheduled','live')),
    'open_bets', (select count(*) from public.bets where status = 'open'),
    'open_stakes_minor', (select coalesce(sum(stake_minor),0) from public.bets where status = 'open'),
    'settled_bets', (select count(*) from public.bets where status <> 'open'),
    'settled_stakes_minor', (select coalesce(sum(stake_minor),0) from public.bets where status <> 'open'),
    'settled_returns_minor', (select coalesce(sum(payout_minor),0) from public.bets where status <> 'open'),
    'approved_deposits_minor', (select coalesce(sum(amount_minor),0) from public.deposits where status = 'approved'),
    'paid_withdrawals_minor', (select coalesce(sum(amount_minor),0) from public.withdrawals where status = 'paid'),
    'wallet_liability_minor', (select coalesce(sum(balance_minor + reserved_minor),0) from public.wallet_accounts),
    'ledger_mismatches', (select count(*) from public.wallet_accounts w where w.balance_minor <> coalesce((select sum(amount_minor) from public.ledger_entries l where l.user_id = w.user_id),0)
                                                                  or w.reserved_minor <> coalesce((select sum(reserved_change_minor) from public.ledger_entries l where l.user_id = w.user_id),0))
  );
end $$;

-- =========================================================
-- FUNCTION PRIVILEGES
-- =========================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;
grant execute on function public.is_staff(uuid) to anon, authenticated;
grant execute on function public.can_finance(uuid) to anon, authenticated;
grant execute on function public.can_trade(uuid) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.admin_exists() to authenticated;
grant execute on function public.place_bet(text, jsonb, bigint, boolean) to authenticated;
grant execute on function public.submit_deposit(bigint, text, text, text) to authenticated;
grant execute on function public.cancel_deposit(uuid) to authenticated;
grant execute on function public.request_withdrawal(bigint, text, text, text) to authenticated;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;
grant execute on function public.wallet_summary() to authenticated;
grant execute on function public.set_rg_limits(bigint, bigint, bigint, int) to authenticated;
grant execute on function public.self_exclude(int) to authenticated;
grant execute on function public.take_break(int) to authenticated;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.account_status, text) to authenticated;
grant execute on function public.admin_update_setting(text, jsonb) to authenticated;
grant execute on function public.admin_review_deposit(uuid, text, text) to authenticated;
grant execute on function public.admin_update_withdrawal(uuid, public.withdrawal_status, text, text) to authenticated;
grant execute on function public.admin_create_match(uuid, text, text, timestamptz, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_update_match(uuid, public.match_status, int, int, int, int, int, boolean) to authenticated;
grant execute on function public.admin_set_odds(uuid, numeric) to authenticated;
grant execute on function public.admin_set_market_status(uuid, public.market_status) to authenticated;
grant execute on function public.admin_settle_market(uuid, uuid[], boolean) to authenticated;
grant execute on function public.admin_void_bet(uuid, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;

-- =========================================================
-- STORAGE POLICIES (payment-slips, private)
-- =========================================================
create policy "Users upload own payment slips" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users and finance read payment slips" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.can_finance(auth.uid()) or public.has_role(auth.uid(), 'auditor')));

-- =========================================================
-- REALTIME
-- =========================================================
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.markets;
alter publication supabase_realtime add table public.selections;
alter publication supabase_realtime add table public.wallet_accounts;
alter publication supabase_realtime add table public.notifications;

-- =========================================================
-- SAMPLE DATA (clearly labelled provenance = 'sample')
-- =========================================================
do $$
declare epl uuid; laliga uuid; seriea uuid; bundes uuid; ucl uuid; ligue1 uuid; futsal uuid; v uuid;
begin
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','Premier League','England',1,true) returning id into epl;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','LaLiga','Spain',2,true) returning id into laliga;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','Champions League','Europe',3,true) returning id into ucl;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','Serie A','Italy',4,true) returning id into seriea;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','Bundesliga','Germany',5,true) returning id into bundes;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('football','Ligue 1','France',6,false) returning id into ligue1;
  insert into public.competitions(sport, name, country, sort_order, is_featured) values ('futsal','Futsal Champions League','Europe',20,false) returning id into futsal;

  insert into public.matches(competition_id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, provenance)
    values (epl, 'Arsenal', 'Chelsea', now() - interval '52 minutes', 'live', 52, 1, 0, 'sample') returning id into v;
  perform public._create_match_markets(v, 1.55, 4.20, 6.00, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, provenance)
    values (laliga, 'Real Betis', 'Sevilla', now() - interval '23 minutes', 'live', 23, 0, 0, 'sample') returning id into v;
  perform public._create_match_markets(v, 2.30, 3.10, 3.25, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, provenance)
    values (seriea, 'Atalanta', 'Lazio', now() - interval '78 minutes', 'live', 71, 2, 2, 'sample') returning id into v;
  perform public._create_match_markets(v, 2.90, 2.40, 3.60, true);

  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (epl, 'Liverpool', 'Manchester City', now() + interval '3 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.45, 3.60, 2.75, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (epl, 'Tottenham', 'Newcastle', now() + interval '5 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.20, 3.50, 3.10, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (epl, 'Aston Villa', 'Brighton', now() + interval '1 day 2 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.05, 3.55, 3.45, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (laliga, 'Barcelona', 'Atlético Madrid', now() + interval '6 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 1.85, 3.80, 4.10, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (laliga, 'Real Sociedad', 'Villarreal', now() + interval '1 day 4 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.40, 3.30, 2.95, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (ucl, 'Bayern Munich', 'Paris Saint-Germain', now() + interval '2 days 7 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.10, 3.75, 3.20, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (ucl, 'Inter', 'Real Madrid', now() + interval '2 days 7 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.85, 3.30, 2.50, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (seriea, 'Juventus', 'AC Milan', now() + interval '1 day 6 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.25, 3.15, 3.40, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (bundes, 'Borussia Dortmund', 'RB Leipzig', now() + interval '8 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.15, 3.70, 3.15, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (bundes, 'Bayer Leverkusen', 'Stuttgart', now() + interval '1 day 8 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 1.75, 4.00, 4.40, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (ligue1, 'Marseille', 'Lyon', now() + interval '1 day 9 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 2.00, 3.60, 3.60, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (futsal, 'Sporting CP', 'Palma Futsal', now() + interval '1 day 3 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 1.95, 4.50, 3.10, true);
  insert into public.matches(competition_id, home_team, away_team, kickoff_at, provenance) values (futsal, 'FC Barcelona Futsal', 'Kairat Almaty', now() + interval '2 days 2 hours', 'sample') returning id into v;
  perform public._create_match_markets(v, 1.60, 5.25, 4.00, true);
end $$;
