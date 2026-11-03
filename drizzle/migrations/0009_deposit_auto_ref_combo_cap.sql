-- 1) Deposits: the bank transfer reference is now optional; an internal reference is generated.
create or replace function public.submit_deposit(_amount_minor bigint, _bank_reference text, _slip_path text, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_dup boolean := false; l public.rg_limits%rowtype; v_sum bigint;
        v_ref text := 'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        v_bank_ref text := nullif(trim(coalesce(_bank_reference, '')), '');
begin
  perform public._assert_active(v_user, true);
  if _amount_minor < coalesce(public.setting_bigint('min_deposit_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum deposit'; end if;
  if _amount_minor > coalesce(public.setting_bigint('max_deposit_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum deposit'; end if;
  if v_bank_ref is not null and length(v_bank_ref) > 100 then raise exception 'INVALID|Reference is too long'; end if;
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

  if v_bank_ref is not null then
    select exists (select 1 from public.deposits where lower(bank_reference) = lower(v_bank_ref) and status <> 'cancelled') into v_dup;
  end if;
  insert into public.deposits(reference, user_id, amount_minor, bank_reference, slip_path, user_note, flagged_duplicate)
  values (v_ref, v_user, _amount_minor, coalesce(v_bank_ref, v_ref), _slip_path, nullif(trim(coalesce(_note,'')), ''), v_dup)
  returning id into v_id;
  perform public._notify(v_user, 'deposit', 'Deposit submitted', 'Deposit ' || v_ref || ' is pending verification. Funds are credited only after the transfer is confirmed.');
  return v_id;
end $$;

-- 2) Maximum combined odds per bet (default 100.00), readable by everyone.
insert into public.system_settings(key, value) values ('max_combo_odds', '100'::jsonb) on conflict (key) do nothing;

drop policy if exists "Public settings readable" on public.system_settings;
create policy "Public settings readable" on public.system_settings for select to anon, authenticated
using (key in ('currency','real_money_enabled','min_deposit_minor','max_deposit_minor','min_withdrawal_minor','max_withdrawal_minor','max_withdrawals_per_day','min_stake_minor','max_stake_minor','max_payout_minor','max_combo_selections','max_combo_odds'));

create or replace function public.place_bet(_bet_type text, _items jsonb, _stake_minor bigint, _accept_odds_changes boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_count int; v_item jsonb; r record;
        v_total numeric := 1; v_matches uuid[] := '{}'; v_changed jsonb := '[]'::jsonb;
        v_bet uuid; v_ref text; v_potential bigint; v_max_payout bigint; v_daily bigint; v_today bigint;
        v_rows jsonb := '[]'::jsonb; v_max_odds numeric;
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

  select (value #>> '{}')::numeric into v_max_odds from public.system_settings where key = 'max_combo_odds';
  v_total := least(round(v_total, 2), coalesce(v_max_odds, 100));
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
end $function$;

-- Settlement never pays more than the odds the bet was accepted at (which include the cap).
create or replace function public._settle_bet(_bet uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    v_payout := least(floor(b.stake_minor * least(round(v_odds, 2), b.total_odds))::bigint, v_max);
    update public.bets set status = 'won', payout_minor = v_payout, settled_at = now() where id = _bet;
    perform public._post_ledger(b.user_id, 'bet_payout', v_payout, 0, 'SETTLE-' || b.id, 'Winnings for ' || b.reference, 'bet', b.id, 'house:bets');
    perform public._notify(b.user_id, 'bet', 'Bet won!', 'Bet ' || b.reference || ' won. Returns have been credited to your wallet.');
  end if;
end $function$;