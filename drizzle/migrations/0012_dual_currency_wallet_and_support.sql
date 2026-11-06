
alter table public.wallet_accounts add column if not exists currency text not null default 'MVR';
alter table public.wallet_accounts add constraint wallet_accounts_currency_chk check (currency in ('MVR','USDT'));
alter table public.bets add column if not exists currency text not null default 'MVR';
alter table public.withdrawals add column if not exists currency text not null default 'MVR';
alter table public.withdrawals add column if not exists payout_mvr_minor bigint;
alter table public.deposits add column if not exists credit_currency text;
alter table public.deposits add column if not exists credited_minor bigint;

drop policy if exists "Public settings readable" on public.system_settings;
create policy "Public settings readable" on public.system_settings for select to anon, authenticated
using (key = any (array['currency','real_money_enabled','min_deposit_minor','max_deposit_minor','min_withdrawal_minor','max_withdrawal_minor','max_withdrawals_per_day','min_stake_minor','max_stake_minor','max_payout_minor','max_combo_selections','max_combo_odds','combo_reduce_from','usdt_convert_rate','usdt_withdraw_rate']));

-- USDT rates: 'convert' = USDT->MVR when currencies mix (lower), 'withdraw' = USDT->MVR for bank payouts
create or replace function public._usdt_rate(_kind text) returns numeric
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select (value #>> '{}')::numeric from public.system_settings where key = 'usdt_' || _kind || '_rate'),
                  case when _kind = 'withdraw' then 21.00 else 20.50 end)
$$;

-- Converts a USDT amount to the wallet's currency (only USDT -> MVR ever happens)
create or replace function public._to_wallet(_user uuid, _amount bigint, _currency text) returns bigint
language plpgsql stable security definer set search_path to 'public' as $$
declare v_cur text;
begin
  select currency into v_cur from public.wallet_accounts where user_id = _user;
  if _currency = 'USDT' and v_cur = 'MVR' then return round(_amount * public._usdt_rate('convert'))::bigint; end if;
  return _amount;
end $$;

-- Scale an MVR limit into the wallet currency
create or replace function public._limit_in(_mvr_minor bigint, _currency text) returns bigint
language sql stable security definer set search_path to 'public' as $$
  select case when _mvr_minor is null then null when _currency = 'USDT' then ceil(_mvr_minor / public._usdt_rate('convert'))::bigint else _mvr_minor end
$$;

create or replace function public._convert_wallet_to_mvr(_user uuid, _ref text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare w public.wallet_accounts%rowtype; v_new bigint;
begin
  select * into w from public.wallet_accounts where user_id = _user for update;
  if not found or w.currency = 'MVR' then return; end if;
  if w.reserved_minor <> 0 or exists (select 1 from public.withdrawals where user_id = _user and status in ('requested','pending_review','approved','processing')) then
    raise exception 'INVALID|Player has a pending USDT withdrawal. Finish or reject it before converting the wallet to MVR.';
  end if;
  update public.wallet_accounts set currency = 'MVR' where user_id = _user;
  v_new := round(w.balance_minor * public._usdt_rate('convert'))::bigint;
  if v_new - w.balance_minor <> 0 then
    perform public._post_ledger(_user, 'conversion', v_new - w.balance_minor, 0, 'CONV-' || _ref,
      'Converted ' || to_char(w.balance_minor / 100.0, 'FM999,999,990.00') || ' USDT to MVR at ' || public._usdt_rate('convert'), null, null, 'house:fx');
  end if;
end $$;

create or replace function public.admin_review_deposit(_id uuid, _decision text, _note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare d public.deposits%rowtype; w public.wallet_accounts%rowtype; v_cur text; v_amt bigint; v_empty boolean;
begin
  if not public.can_finance(auth.uid()) then raise exception 'FORBIDDEN|Finance permission required'; end if;
  select * into d from public.deposits where id = _id for update;
  if not found then raise exception 'NOT_FOUND|Deposit not found'; end if;
  if d.status not in ('pending','under_review') then raise exception 'INVALID|This deposit has already been %', d.status; end if;
  if _decision = 'under_review' then
    update public.deposits set status = 'under_review', review_note = coalesce(nullif(trim(_note),''), review_note), reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  elsif _decision = 'approve' then
    select * into w from public.wallet_accounts where user_id = d.user_id for update;
    if d.method = 'crypto' and upper(coalesce(d.crypto_symbol,'')) = 'USDT' then
      v_empty := w.balance_minor = 0 and w.reserved_minor = 0
        and not exists (select 1 from public.bets where user_id = d.user_id and status = 'open');
      if w.currency = 'USDT' or v_empty then
        update public.wallet_accounts set currency = 'USDT' where user_id = d.user_id;
        v_cur := 'USDT'; v_amt := round(d.crypto_amount * 100)::bigint;
      else
        v_cur := 'MVR'; v_amt := round(d.crypto_amount * public._usdt_rate('convert') * 100)::bigint;
      end if;
    else
      if w.currency = 'USDT' then perform public._convert_wallet_to_mvr(d.user_id, d.id::text); end if;
      v_cur := 'MVR'; v_amt := d.amount_minor;
    end if;
    update public.deposits set status = 'approved', review_note = nullif(trim(_note),''), reviewed_by = auth.uid(), reviewed_at = now(),
      credit_currency = v_cur, credited_minor = v_amt where id = _id;
    perform public._post_ledger(d.user_id, 'deposit', v_amt, 0, 'DEP-' || d.id, case when d.method = 'crypto' then 'Crypto deposit ' else 'Bank transfer deposit ' end || d.reference, 'deposit', d.id, 'house:bank');
    perform public._notify(d.user_id, 'deposit', 'Deposit approved', 'Deposit ' || d.reference || ' has been verified and credited: ' || to_char(v_amt / 100.0, 'FM999,999,990.00') || ' ' || v_cur || '.');
  elsif _decision = 'reject' then
    if coalesce(trim(_note), '') = '' then raise exception 'INVALID|A rejection reason is required'; end if;
    update public.deposits set status = 'rejected', review_note = trim(_note), reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
    perform public._notify(d.user_id, 'deposit', 'Deposit rejected', 'Deposit ' || d.reference || ' was rejected: ' || trim(_note));
  else
    raise exception 'INVALID|Unknown decision';
  end if;
  perform public._audit('deposit_' || _decision, 'deposit', _id::text, jsonb_build_object('note', _note, 'amount_minor', d.amount_minor));
end $function$;

create or replace function public.place_bet(_bet_type text, _items jsonb, _stake_minor bigint, _accept_odds_changes boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid := auth.uid(); v_count int; v_item jsonb; r record;
        v_total numeric := 1; v_matches uuid[] := '{}'; v_changed jsonb := '[]'::jsonb;
        v_bet uuid; v_ref text; v_potential bigint; v_max_payout bigint; v_daily bigint; v_today bigint;
        v_rows jsonb := '[]'::jsonb; v_min bigint; v_cur text;
begin
  perform public._assert_active(v_user, true);
  select currency into v_cur from public.wallet_accounts where user_id = v_user;
  v_cur := coalesce(v_cur, 'MVR');
  if _bet_type not in ('single','combo') then raise exception 'INVALID|Unknown bet type'; end if;
  v_count := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  if _bet_type = 'single' and v_count <> 1 then raise exception 'INVALID|A single bet needs exactly one selection'; end if;
  if _bet_type = 'combo' and (v_count < 2 or v_count > coalesce(public.setting_bigint('max_combo_selections'), 12)) then
    raise exception 'INVALID|A combo bet needs between 2 and % selections', coalesce(public.setting_bigint('max_combo_selections'), 12);
  end if;
  v_min := coalesce(public._limit_in(public.setting_bigint('min_stake_minor'), v_cur), 1);
  if _stake_minor is null or _stake_minor < v_min then
    raise exception 'STAKE_TOO_LOW|Minimum stake is % %', to_char(v_min / 100.0, 'FM999,999,990.00'), v_cur;
  end if;
  if _stake_minor > coalesce(public._limit_in(public.setting_bigint('max_stake_minor'), v_cur), 9223372036854775807) then
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

  if _bet_type = 'combo' then v_total := public.combo_total_odds(v_total); else v_total := round(v_total, 2); end if;
  v_max_payout := coalesce(public._limit_in(public.setting_bigint('max_payout_minor'), v_cur), 9223372036854775807);
  v_potential := least(floor(_stake_minor * v_total)::bigint, v_max_payout);
  v_ref := 'B' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.bets(reference, user_id, bet_type, stake_minor, total_odds, potential_return_minor, currency)
  values (v_ref, v_user, _bet_type, _stake_minor, v_total, v_potential, v_cur) returning id into v_bet;

  insert into public.bet_selections(bet_id, selection_id, market_id, match_id, odds_accepted, match_label, market_name, selection_label)
  select v_bet, (x->>'selection_id')::uuid, (x->>'market_id')::uuid, (x->>'match_id')::uuid, (x->>'odds')::numeric,
         x->>'match_label', x->>'market_name', x->>'label'
    from jsonb_array_elements(v_rows) x;

  perform public._post_ledger(v_user, 'bet_stake', -_stake_minor, 0, 'STAKE-' || v_bet, 'Stake for ' || v_ref, 'bet', v_bet, 'house:bets');
  perform public._notify(v_user, 'bet', 'Bet accepted', 'Bet ' || v_ref || ' was accepted at odds ' || v_total || '.');
  return jsonb_build_object('bet_id', v_bet, 'reference', v_ref, 'total_odds', v_total, 'potential_return_minor', v_potential, 'currency', v_cur);
end $function$;

create or replace function public._settle_bet(_bet uuid) returns void
language plpgsql security definer set search_path to 'public' as $function$
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
    perform public._post_ledger(b.user_id, 'bet_refund', public._to_wallet(b.user_id, v_payout, b.currency), 0, 'SETTLE-' || b.id, 'Stake returned (void) ' || b.reference, 'bet', b.id, 'house:bets');
    perform public._notify(b.user_id, 'bet', 'Bet voided', 'Your stake for bet ' || b.reference || ' was returned.');
  else
    for r in select odds_accepted from public.bet_selections where bet_id = _bet and result = 'won' loop
      v_odds := v_odds * r.odds_accepted;
    end loop;
    v_max := coalesce(public._limit_in(public.setting_bigint('max_payout_minor'), b.currency), 9223372036854775807);
    v_payout := least(floor(b.stake_minor * least(round(v_odds, 2), b.total_odds))::bigint, v_max);
    update public.bets set status = 'won', payout_minor = v_payout, settled_at = now() where id = _bet;
    perform public._post_ledger(b.user_id, 'bet_payout', public._to_wallet(b.user_id, v_payout, b.currency), 0, 'SETTLE-' || b.id, 'Winnings for ' || b.reference, 'bet', b.id, 'house:bets');
    perform public._notify(b.user_id, 'bet', 'Bet won!', 'Bet ' || b.reference || ' won. Returns have been credited to your wallet.');
  end if;
end $function$;

create or replace function public.request_withdrawal(_amount_minor bigint, _bank_name text, _account_name text, _account_number text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid := auth.uid(); v_id uuid; v_n int; v_cur text; v_payout bigint;
begin
  perform public._assert_active(v_user, false);
  select currency into v_cur from public.wallet_accounts where user_id = v_user;
  v_cur := coalesce(v_cur, 'MVR');
  v_payout := case when v_cur = 'USDT' then round(_amount_minor * public._usdt_rate('withdraw'))::bigint else _amount_minor end;
  if v_payout < coalesce(public.setting_bigint('min_withdrawal_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum withdrawal'; end if;
  if v_payout > coalesce(public.setting_bigint('max_withdrawal_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum withdrawal'; end if;
  perform pg_advisory_xact_lock(hashtext('wdr' || v_user::text));
  select count(*) into v_n from public.withdrawals where user_id = v_user and status <> 'cancelled' and created_at >= now() - interval '24 hours';
  if v_n >= coalesce(public.setting_bigint('max_withdrawals_per_day'), 2) then
    raise exception 'LIMIT_REACHED|You can make only % withdrawals per day', coalesce(public.setting_bigint('max_withdrawals_per_day'), 2);
  end if;
  if coalesce(trim(_bank_name),'') = '' or coalesce(trim(_account_name),'') = '' or length(regexp_replace(coalesce(_account_number,''), '\s', '', 'g')) < 4 then
    raise exception 'INVALID|Enter complete bank account details';
  end if;
  insert into public.withdrawals(user_id, amount_minor, bank_name, account_name, account_number, currency, payout_mvr_minor, crypto_rate)
  values (v_user, _amount_minor, trim(_bank_name), trim(_account_name), regexp_replace(_account_number, '\s', '', 'g'), v_cur, v_payout,
          case when v_cur = 'USDT' then public._usdt_rate('withdraw') end)
  returning id into v_id;
  perform public._post_ledger(v_user, 'withdrawal_reserve', -_amount_minor, _amount_minor, 'WDR-RES-' || v_id,
    'Funds reserved for withdrawal', 'withdrawal', v_id, 'reserve:withdrawals');
  perform public._notify(v_user, 'withdrawal', 'Withdrawal requested', 'Your withdrawal is pending review. The amount has been reserved from your balance.');
  return v_id;
end $function$;

create or replace function public.request_crypto_withdrawal(_wallet_id text, _amount_minor bigint, _address text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid := auth.uid(); v_id uuid; v_n int; w jsonb; v_rate numeric; v_cur text; v_mvr bigint; v_coin numeric;
        v_addr text := regexp_replace(coalesce(_address,''), '\s', '', 'g');
begin
  perform public._assert_active(v_user, false);
  if not exists (select 1 from public.deposits where user_id = v_user and method = 'crypto' and status = 'approved') then
    raise exception 'NOT_ELIGIBLE|Crypto withdrawal is only available after an approved crypto deposit. Please withdraw by bank transfer.';
  end if;
  w := public._crypto_wallet(_wallet_id);
  if w is null then raise exception 'INVALID|This crypto option is not available'; end if;
  select currency into v_cur from public.wallet_accounts where user_id = v_user;
  v_cur := coalesce(v_cur, 'MVR');
  if v_cur = 'USDT' then
    if upper(w->>'symbol') <> 'USDT' then raise exception 'INVALID|Your balance is in USDT; choose a USDT wallet'; end if;
    v_rate := 1; v_coin := round(_amount_minor / 100.0, 6); v_mvr := round(_amount_minor * public._usdt_rate('withdraw'))::bigint;
  else
    v_rate := (w->>'mvr_rate')::numeric;
    if v_rate is null or v_rate <= 0 then raise exception 'INVALID|Exchange rate is not configured'; end if;
    v_coin := round(_amount_minor::numeric / 100 / v_rate, 6); v_mvr := _amount_minor;
  end if;
  if v_mvr < coalesce(public.setting_bigint('min_withdrawal_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum withdrawal'; end if;
  if v_mvr > coalesce(public.setting_bigint('max_withdrawal_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum withdrawal'; end if;
  if length(v_addr) < 20 or length(v_addr) > 120 then raise exception 'INVALID|Enter a valid wallet address'; end if;
  perform pg_advisory_xact_lock(hashtext('wdr' || v_user::text));
  select count(*) into v_n from public.withdrawals where user_id = v_user and status <> 'cancelled' and created_at >= now() - interval '24 hours';
  if v_n >= coalesce(public.setting_bigint('max_withdrawals_per_day'), 2) then
    raise exception 'LIMIT_REACHED|You can make only % withdrawals per day', coalesce(public.setting_bigint('max_withdrawals_per_day'), 2);
  end if;
  insert into public.withdrawals(user_id, amount_minor, bank_name, account_name, account_number,
                                 method, crypto_symbol, crypto_network, crypto_amount, crypto_rate, currency)
  values (v_user, _amount_minor, (w->>'symbol') || ' ' || (w->>'network'), 'Crypto wallet', v_addr,
          'crypto', w->>'symbol', w->>'network', v_coin, v_rate, v_cur)
  returning id into v_id;
  perform public._post_ledger(v_user, 'withdrawal_reserve', -_amount_minor, _amount_minor, 'WDR-RES-' || v_id,
    'Funds reserved for crypto withdrawal', 'withdrawal', v_id, 'reserve:withdrawals');
  perform public._notify(v_user, 'withdrawal', 'Withdrawal requested', 'Your crypto withdrawal is pending review. The amount has been reserved from your balance.');
  return v_id;
end $function$;

create or replace function public.wallet_summary() returns jsonb
language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'currency', coalesce((select currency from public.wallet_accounts where user_id = auth.uid()), 'MVR'),
    'available_minor', coalesce((select balance_minor from public.wallet_accounts where user_id = auth.uid()), 0),
    'reserved_minor', coalesce((select reserved_minor from public.wallet_accounts where user_id = auth.uid()), 0),
    'pending_deposits_minor', coalesce((select sum(amount_minor) from public.deposits where user_id = auth.uid() and status in ('pending','under_review')), 0),
    'pending_withdrawals_minor', coalesce((select sum(amount_minor) from public.withdrawals where user_id = auth.uid() and status in ('requested','pending_review','approved','processing')), 0),
    'total_deposits_minor', coalesce((select sum(coalesce(credited_minor, amount_minor)) from public.deposits where user_id = auth.uid() and status = 'approved'), 0),
    'total_withdrawals_minor', coalesce((select sum(amount_minor) from public.withdrawals where user_id = auth.uid() and status = 'paid'), 0),
    'open_stakes_minor', coalesce((select sum(stake_minor) from public.bets where user_id = auth.uid() and status = 'open'), 0),
    'net_winnings_minor', coalesce((select sum(payout_minor - stake_minor) from public.bets where user_id = auth.uid() and status = 'won'), 0)
  )
$function$;

create or replace function public.admin_player_balances()
returns table(user_id uuid, username text, email text, full_name text, currency text, balance_minor bigint, reserved_minor bigint,
              open_stakes_minor bigint, deposits_count bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.can_finance(auth.uid()) or public.has_role(auth.uid(), 'auditor') or public.has_role(auth.uid(), 'support_agent')) then
    raise exception 'FORBIDDEN|Staff only';
  end if;
  return query
  select p.id, p.username, p.email, p.full_name, w.currency, w.balance_minor, w.reserved_minor,
         coalesce((select sum(b.stake_minor) from public.bets b where b.user_id = p.id and b.status = 'open'), 0)::bigint,
         (select count(*) from public.deposits d where d.user_id = p.id and d.status = 'approved'),
         w.updated_at
    from public.profiles p join public.wallet_accounts w on w.user_id = p.id
   order by w.balance_minor + w.reserved_minor desc;
end $$;
grant execute on function public.admin_player_balances() to authenticated;

-- ===== Live support chat =====
create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'bot' check (status in ('bot','waiting','agent','closed')),
  agent_id uuid,
  subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender text not null check (sender in ('user','bot','agent','system')),
  sender_id uuid,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.support_threads(user_id);
create index on public.support_threads(status, updated_at desc);
create index on public.support_messages(thread_id, created_at);

grant select on public.support_threads to authenticated;
grant select on public.support_messages to authenticated;
grant all on public.support_threads, public.support_messages to service_role;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

create or replace function public.can_support(_user_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.has_role(_user_id,'super_admin') or public.has_role(_user_id,'support_agent')
$$;

create policy "Own or support reads threads" on public.support_threads for select to authenticated
  using (user_id = auth.uid() or public.can_support(auth.uid()));
create policy "Own or support reads messages" on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_threads t where t.id = thread_id and (t.user_id = auth.uid() or public.can_support(auth.uid()))));

create or replace function public.support_open_thread() returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'AUTH|Sign in to chat'; end if;
  select id into v from public.support_threads where user_id = auth.uid() and status <> 'closed' order by created_at desc limit 1;
  if v is null then
    insert into public.support_threads(user_id) values (auth.uid()) returning id into v;
    insert into public.support_messages(thread_id, sender, body) values (v, 'bot',
      'Hi! I''m the Pitchside assistant. Ask me about deposits, withdrawals, bets or your account — or tap "Talk to a live agent".');
  end if;
  return v;
end $$;

-- sender: 'user' (owner) | 'bot' (owner, only while thread in bot mode) | 'agent' (support staff)
create or replace function public.support_send(_thread uuid, _body text, _as text default 'user') returns void
language plpgsql security definer set search_path to 'public' as $$
declare t public.support_threads%rowtype; v_body text := trim(coalesce(_body,''));
begin
  select * into t from public.support_threads where id = _thread for update;
  if not found then raise exception 'NOT_FOUND|Chat not found'; end if;
  if length(v_body) = 0 or length(v_body) > 2000 then raise exception 'INVALID|Message must be 1–2000 characters'; end if;
  if _as = 'agent' then
    if not public.can_support(auth.uid()) then raise exception 'FORBIDDEN|Support only'; end if;
    update public.support_threads set status = 'agent', agent_id = auth.uid(), updated_at = now() where id = _thread;
    insert into public.support_messages(thread_id, sender, sender_id, body) values (_thread, 'agent', auth.uid(), v_body);
  elsif t.user_id = auth.uid() then
    if t.status = 'closed' then raise exception 'INVALID|This chat is closed'; end if;
    if _as = 'bot' and t.status <> 'bot' then return; end if;
    insert into public.support_messages(thread_id, sender, sender_id, body)
      values (_thread, case when _as = 'bot' then 'bot' else 'user' end, case when _as = 'bot' then null else auth.uid() end, v_body);
    update public.support_threads set updated_at = now(), subject = coalesce(subject, case when _as = 'user' then left(v_body, 80) end) where id = _thread;
  else
    raise exception 'FORBIDDEN|Not your chat';
  end if;
end $$;

create or replace function public.support_escalate(_thread uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.support_threads set status = 'waiting', updated_at = now()
   where id = _thread and user_id = auth.uid() and status = 'bot';
  if found then
    insert into public.support_messages(thread_id, sender, body) values (_thread, 'system', 'Connecting you to a live agent… please wait, someone will reply here shortly.');
  end if;
end $$;

create or replace function public.support_close(_thread uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.support_threads set status = 'closed', updated_at = now()
   where id = _thread and (user_id = auth.uid() or public.can_support(auth.uid()));
  if found then insert into public.support_messages(thread_id, sender, body) values (_thread, 'system', 'Chat closed.'); end if;
end $$;

grant execute on function public.support_open_thread(), public.support_send(uuid, text, text), public.support_escalate(uuid), public.support_close(uuid) to authenticated;

alter publication supabase_realtime add table public.support_messages, public.support_threads;
