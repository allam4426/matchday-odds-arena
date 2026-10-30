create or replace function public._provider_settle_match_win(_match uuid, _win jsonb, _h int, _a int)
returns int language plpgsql security definer set search_path = public as $$
declare mk record; v_win jsonb; v_bet uuid; v_count int := 0;
begin
  for mk in select id, key from public.markets where match_id = _match and status in ('open','suspended') for update loop
    v_win := _win->mk.key;
    if v_win is null then
      update public.markets set status = 'suspended' where id = mk.id;
      continue;
    end if;
    if v_win ? '__void' then
      update public.selections set result = 'void' where market_id = mk.id;
      update public.markets set status = 'void', settled_at = now() where id = mk.id;
    else
      update public.selections set result = case when v_win ? label then 'won'::public.selection_result else 'lost'::public.selection_result end where market_id = mk.id;
      update public.markets set status = 'settled', settled_at = now() where id = mk.id;
    end if;
    update public.bet_selections bs set result = s.result from public.selections s where bs.selection_id = s.id and bs.market_id = mk.id;
    for v_bet in select distinct b.id from public.bets b join public.bet_selections bs on bs.bet_id = b.id where bs.market_id = mk.id and b.status = 'open' loop
      perform public._settle_bet(v_bet);
      v_count := v_count + 1;
    end loop;
    perform public._audit('auto_settle_market', 'market', mk.id::text, jsonb_build_object('score', _h || '-' || _a));
  end loop;
  return v_count;
end $$;
revoke execute on function public._provider_settle_match_win(uuid, jsonb, int, int) from public, anon, authenticated;
grant execute on function public._provider_settle_match_win(uuid, jsonb, int, int) to service_role;

create or replace function public.provider_sync(_matches jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p jsonb; v_comp uuid; v_match uuid; v_old public.matches%rowtype; v_new boolean;
        mk record; sel record; v_odds jsonb; v_new_odds numeric; v_suspend jsonb; i int; v_ord int;
        v_created int := 0; v_updated int := 0; v_settled int := 0;
        v_default jsonb := '[{"key":"1x2","name":"Match Result","labels":["1","X","2"]},{"key":"dc","name":"Double Chance","labels":["1X","12","X2"]},{"key":"ou25","name":"Total Goals 2.5","labels":["Over 2.5","Under 2.5"]},{"key":"btts","name":"Both Teams To Score","labels":["Yes","No"]}]';
        v_defs jsonb; d jsonb; m uuid;
begin
  for p in select * from jsonb_array_elements(_matches) loop
    select id into v_comp from public.competitions where provider_ref = p->>'comp_ref';
    if v_comp is null then
      insert into public.competitions(sport, name, country, sort_order, is_featured, provider_ref)
      values ('football', p->>'comp_name', p->>'comp_country', coalesce((p->>'comp_sort')::int, 50), coalesce((p->>'comp_featured')::boolean, false), p->>'comp_ref')
      returning id into v_comp;
    end if;

    select * into v_old from public.matches where provider_ref = p->>'ref' for update;
    v_new := not found;
    if v_new then
      insert into public.matches(competition_id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, ht_home_score, ht_away_score, provenance, provider_ref)
      values (v_comp, p->>'home', p->>'away', (p->>'kickoff')::timestamptz, (p->>'status')::public.match_status, (p->>'minute')::int,
              coalesce((p->>'hs')::int, 0), coalesce((p->>'as')::int, 0), (p->>'hth')::int, (p->>'hta')::int, 'provider', p->>'ref')
      returning id into v_match;
      v_created := v_created + 1;
    else
      v_match := v_old.id;
      if v_old.status is distinct from (p->>'status')::public.match_status or v_old.minute is distinct from (p->>'minute')::int
         or v_old.home_score <> coalesce((p->>'hs')::int, 0) or v_old.away_score <> coalesce((p->>'as')::int, 0)
         or v_old.kickoff_at <> (p->>'kickoff')::timestamptz or v_old.ht_home_score is distinct from (p->>'hth')::int then
        update public.matches set status = (p->>'status')::public.match_status, minute = (p->>'minute')::int,
          home_score = coalesce((p->>'hs')::int, 0), away_score = coalesce((p->>'as')::int, 0),
          ht_home_score = (p->>'hth')::int, ht_away_score = (p->>'hta')::int, kickoff_at = (p->>'kickoff')::timestamptz,
          home_team = p->>'home', away_team = p->>'away'
        where id = v_match;
        v_updated := v_updated + 1;
      end if;
    end if;

    v_suspend := coalesce(p->'suspend', '[]'::jsonb);
    v_defs := coalesce(p->'defs', v_default);

    if (p->>'status') in ('scheduled','live') and p ? 'odds' then
      v_ord := 0;
      for d in select * from jsonb_array_elements(v_defs) loop
        v_ord := v_ord + 1;
        v_odds := p->'odds'->(d->>'key');
        if v_odds is null then continue; end if;
        select id, status into mk from public.markets where match_id = v_match and key = d->>'key';
        if not found then
          -- new markets are only opened before kick-off or while still priced as open
          insert into public.markets(match_id, key, name, sort_order, status)
          values (v_match, d->>'key', d->>'name', v_ord,
                  case when v_suspend ? (d->>'key') then 'suspended'::public.market_status else 'open'::public.market_status end)
          returning id into m;
          for i in 0 .. jsonb_array_length(d->'labels') - 1 loop
            insert into public.selections(market_id, label, odds, sort_order)
            values (m, d->'labels'->>i, round((v_odds->>i)::numeric, 2), i + 1);
          end loop;
        elsif mk.status in ('open','suspended') then
          update public.markets set sort_order = v_ord, name = d->>'name' where id = mk.id and (sort_order <> v_ord or name <> d->>'name');
          for sel in select id, label, odds, sort_order from public.selections where market_id = mk.id order by sort_order loop
            v_new_odds := round((v_odds->>(sel.sort_order - 1))::numeric, 2);
            if v_new_odds is not null and v_new_odds between 1.01 and 1000 and v_new_odds <> sel.odds then
              update public.selections set odds = v_new_odds where id = sel.id;
              insert into public.odds_history(selection_id, old_odds, new_odds, source) values (sel.id, sel.odds, v_new_odds, 'auto');
            end if;
          end loop;
          update public.markets set status = case when v_suspend ? (d->>'key') then 'suspended'::public.market_status else 'open'::public.market_status end
          where id = mk.id and status <> case when v_suspend ? (d->>'key') then 'suspended'::public.market_status else 'open'::public.market_status end;
        end if;
      end loop;
    elsif (p->>'status') = 'postponed' then
      update public.markets set status = 'suspended' where match_id = v_match and status = 'open';
    elsif (p->>'status') = 'finished' and p ? 'settle_win' then
      v_settled := v_settled + public._provider_settle_match_win(v_match, p->'settle_win', (p->>'settle_h')::int, (p->>'settle_a')::int);
    elsif (p->>'status') = 'finished' and p ? 'settle_h' then
      v_settled := v_settled + public._provider_settle_match(v_match, (p->>'settle_h')::int, (p->>'settle_a')::int, false);
    elsif (p->>'status') in ('cancelled','abandoned') then
      v_settled := v_settled + public._provider_settle_match(v_match, 0, 0, true);
    end if;
  end loop;

  if jsonb_array_length(_matches) > 0 then
    update public.matches set is_hidden = true where provenance = 'sample' and not is_hidden;
  end if;

  update public.system_settings set value = jsonb_build_object('name', 'football-data.org', 'status', 'connected', 'last_sync_at', now()), updated_at = now()
  where key = 'sports_data_provider';

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'bets_settled', v_settled);
end $$;
revoke execute on function public.provider_sync(jsonb) from public, anon, authenticated;
grant execute on function public.provider_sync(jsonb) to service_role;