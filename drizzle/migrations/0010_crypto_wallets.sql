-- Crypto deposits and withdrawals. Wallet list (address, network, minimum, MVR rate) lives in system_settings.crypto_wallets.
alter table public.deposits add column if not exists method text not null default 'bank';
alter table public.deposits add column if not exists crypto_symbol text;
alter table public.deposits add column if not exists crypto_network text;
alter table public.deposits add column if not exists crypto_amount numeric;
alter table public.deposits add column if not exists crypto_rate numeric;

alter table public.withdrawals add column if not exists method text not null default 'bank';
alter table public.withdrawals add column if not exists crypto_symbol text;
alter table public.withdrawals add column if not exists crypto_network text;
alter table public.withdrawals add column if not exists crypto_amount numeric;
alter table public.withdrawals add column if not exists crypto_rate numeric;

insert into public.system_settings(key, value) values
  ('crypto_wallets', '[{"id":"usdt-trc20","name":"USDT Tether","symbol":"USDT","network":"TRC20","address":"","min_amount":10,"mvr_rate":21,"visible":false}]'::jsonb)
on conflict (key) do nothing;

drop policy if exists "Signed-in users read bank settings" on public.system_settings;
create policy "Signed-in users read bank settings" on public.system_settings for select to authenticated
using (key in ('bank_details','bank_accounts','crypto_wallets'));

create or replace function public._crypto_wallet(_wallet_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select w from public.system_settings s, jsonb_array_elements(s.value) w
  where s.key = 'crypto_wallets' and w->>'id' = _wallet_id and coalesce((w->>'visible')::boolean, false)
  limit 1
$$;

create or replace function public.submit_crypto_deposit(_wallet_id text, _crypto_amount numeric, _txid text, _slip_path text, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; w jsonb; v_rate numeric; v_minor bigint; v_dup boolean; l public.rg_limits%rowtype; v_sum bigint;
        v_ref text := 'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        v_txid text := nullif(trim(coalesce(_txid, '')), '');
        v_slip text := nullif(trim(coalesce(_slip_path, '')), '');
begin
  perform public._assert_active(v_user, true);
  w := public._crypto_wallet(_wallet_id);
  if w is null or coalesce(w->>'address', '') = '' then raise exception 'INVALID|This crypto wallet is not available'; end if;
  v_rate := (w->>'mvr_rate')::numeric;
  if v_rate is null or v_rate <= 0 then raise exception 'INVALID|Exchange rate is not configured'; end if;
  if _crypto_amount is null or _crypto_amount <= 0 then raise exception 'INVALID|Enter the amount you sent'; end if;
  if _crypto_amount < coalesce((w->>'min_amount')::numeric, 0) then
    raise exception 'AMOUNT_TOO_LOW|Minimum deposit is % %', w->>'min_amount', w->>'symbol';
  end if;
  if v_txid is null or length(v_txid) < 8 or length(v_txid) > 120 then raise exception 'INVALID|Enter the transaction hash (TXID)'; end if;
  if v_slip is not null and split_part(v_slip, '/', 1) <> v_user::text then raise exception 'INVALID|Invalid screenshot upload'; end if;

  v_minor := round(_crypto_amount * v_rate * 100)::bigint;
  if v_minor > coalesce(public.setting_bigint('max_deposit_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum deposit'; end if;

  select * into l from public.rg_limits where user_id = v_user;
  if l.daily_deposit_limit_minor is not null then
    select coalesce(sum(amount_minor),0) into v_sum from public.deposits
     where user_id = v_user and status in ('pending','under_review','approved') and created_at >= date_trunc('day', now());
    if v_sum + v_minor > l.daily_deposit_limit_minor then raise exception 'LIMIT_REACHED|This exceeds your daily deposit limit'; end if;
  end if;
  if l.weekly_deposit_limit_minor is not null then
    select coalesce(sum(amount_minor),0) into v_sum from public.deposits
     where user_id = v_user and status in ('pending','under_review','approved') and created_at >= now() - interval '7 days';
    if v_sum + v_minor > l.weekly_deposit_limit_minor then raise exception 'LIMIT_REACHED|This exceeds your weekly deposit limit'; end if;
  end if;

  select exists (select 1 from public.deposits where lower(bank_reference) = lower(v_txid) and status <> 'cancelled') into v_dup;
  insert into public.deposits(reference, user_id, amount_minor, bank_reference, slip_path, user_note, flagged_duplicate,
                              method, crypto_symbol, crypto_network, crypto_amount, crypto_rate)
  values (v_ref, v_user, v_minor, v_txid, coalesce(v_slip, ''), nullif(trim(coalesce(_note,'')), ''), v_dup,
          'crypto', w->>'symbol', w->>'network', _crypto_amount, v_rate)
  returning id into v_id;
  perform public._notify(v_user, 'deposit', 'Crypto deposit submitted',
    'Deposit ' || v_ref || ' of ' || _crypto_amount || ' ' || (w->>'symbol') || ' is pending verification.');
  return v_id;
end $$;

create or replace function public.request_crypto_withdrawal(_wallet_id text, _amount_minor bigint, _address text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_n int; w jsonb; v_rate numeric; v_addr text := regexp_replace(coalesce(_address,''), '\s', '', 'g');
begin
  perform public._assert_active(v_user, false);
  if not exists (select 1 from public.deposits where user_id = v_user and method = 'crypto' and status = 'approved') then
    raise exception 'NOT_ELIGIBLE|Crypto withdrawal is only available after an approved crypto deposit. Please withdraw by bank transfer.';
  end if;
  w := public._crypto_wallet(_wallet_id);
  if w is null then raise exception 'INVALID|This crypto option is not available'; end if;
  v_rate := (w->>'mvr_rate')::numeric;
  if v_rate is null or v_rate <= 0 then raise exception 'INVALID|Exchange rate is not configured'; end if;
  if _amount_minor < coalesce(public.setting_bigint('min_withdrawal_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum withdrawal'; end if;
  if _amount_minor > coalesce(public.setting_bigint('max_withdrawal_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum withdrawal'; end if;
  if length(v_addr) < 20 or length(v_addr) > 120 then raise exception 'INVALID|Enter a valid wallet address'; end if;
  perform pg_advisory_xact_lock(hashtext('wdr' || v_user::text));
  select count(*) into v_n from public.withdrawals where user_id = v_user and status <> 'cancelled' and created_at >= now() - interval '24 hours';
  if v_n >= coalesce(public.setting_bigint('max_withdrawals_per_day'), 2) then
    raise exception 'LIMIT_REACHED|You can make only % withdrawals per day', coalesce(public.setting_bigint('max_withdrawals_per_day'), 2);
  end if;
  insert into public.withdrawals(user_id, amount_minor, bank_name, account_name, account_number,
                                 method, crypto_symbol, crypto_network, crypto_amount, crypto_rate)
  values (v_user, _amount_minor, (w->>'symbol') || ' ' || (w->>'network'), 'Crypto wallet', v_addr,
          'crypto', w->>'symbol', w->>'network', round(_amount_minor::numeric / 100 / v_rate, 6), v_rate)
  returning id into v_id;
  perform public._post_ledger(v_user, 'withdrawal_reserve', -_amount_minor, _amount_minor, 'WDR-RES-' || v_id,
    'Funds reserved for crypto withdrawal', 'withdrawal', v_id, 'reserve:withdrawals');
  perform public._notify(v_user, 'withdrawal', 'Withdrawal requested', 'Your crypto withdrawal is pending review. The amount has been reserved from your balance.');
  return v_id;
end $$;

revoke execute on function public._crypto_wallet(text) from public, anon, authenticated;
grant execute on function public.submit_crypto_deposit(text, numeric, text, text, text) to authenticated;
grant execute on function public.request_crypto_withdrawal(text, bigint, text) to authenticated;