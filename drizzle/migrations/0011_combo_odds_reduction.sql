DROP POLICY IF EXISTS "Public settings readable" ON public.system_settings;
CREATE POLICY "Public settings readable" ON public.system_settings FOR SELECT TO anon, authenticated
USING (key IN ('currency','real_money_enabled','min_deposit_minor','max_deposit_minor','min_withdrawal_minor','max_withdrawal_minor','max_withdrawals_per_day','min_stake_minor','max_stake_minor','max_payout_minor','max_combo_selections','max_combo_odds','combo_reduce_from'));

COMMENT ON TABLE public.system_settings IS 'Key/value settings. max_combo_odds is DEPRECATED (replaced by combo_reduce_from soft reduction).';

CREATE OR REPLACE FUNCTION public.combo_total_odds(_raw numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_from numeric; v numeric := round(_raw, 2);
begin
  select (value #>> '{}')::numeric into v_from from public.system_settings where key = 'combo_reduce_from';
  v_from := coalesce(v_from, 10);
  -- Above the threshold only the square root of the extra growth is paid (smooth, no hard cap).
  if v_from > 1 and v > v_from then
    v := round(v_from * sqrt(v / v_from), 2);
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.place_bet(_bet_type text, _items jsonb, _stake_minor bigint, _accept_odds_changes boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_count int; v_item jsonb; r record;
        v_total numeric := 1; v_matches uuid[] := '{}'; v_changed jsonb := '[]'::jsonb;
        v_bet uuid; v_ref text; v_potential bigint; v_max_payout bigint; v_daily bigint; v_today bigint;
        v_rows jsonb := '[]'::jsonb; v_min bigint;
begin
  perform public._assert_active(v_user, true);
  if _bet_type not in ('single','combo') then raise exception 'INVALID|Unknown bet type'; end if;
  v_count := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  if _bet_type = 'single' and v_count <> 1 then raise exception 'INVALID|A single bet needs exactly one selection'; end if;
  if _bet_type = 'combo' and (v_count < 2 or v_count > coalesce(public.setting_bigint('max_combo_selections'), 12)) then
    raise exception 'INVALID|A combo bet needs between 2 and % selections', coalesce(public.setting_bigint('max_combo_selections'), 12);
  end if;
  v_min := coalesce(public.setting_bigint('min_stake_minor'), 1);
  if _stake_minor is null or _stake_minor < v_min then
    raise exception 'STAKE_TOO_LOW|Minimum stake is %', to_char(v_min / 100.0, 'FM999,999,990.00');
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

  if _bet_type = 'combo' then
    v_total := public.combo_total_odds(v_total);
  else
    v_total := round(v_total, 2);
  end if;
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

REVOKE ALL ON FUNCTION public.combo_total_odds(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.combo_total_odds(numeric) TO authenticated, service_role;