CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount_minor bigint, _bank_name text, _account_name text, _account_number text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_id uuid; v_n int;
begin
  perform public._assert_active(v_user, false);
  if _amount_minor < coalesce(public.setting_bigint('min_withdrawal_minor'), 1) then raise exception 'AMOUNT_TOO_LOW|Amount is below the minimum withdrawal'; end if;
  if _amount_minor > coalesce(public.setting_bigint('max_withdrawal_minor'), 9223372036854775807) then raise exception 'AMOUNT_TOO_HIGH|Amount is above the maximum withdrawal'; end if;
  perform pg_advisory_xact_lock(hashtext('wdr' || v_user::text));
  select count(*) into v_n from public.withdrawals where user_id = v_user and status <> 'cancelled' and created_at >= now() - interval '24 hours';
  if v_n >= coalesce(public.setting_bigint('max_withdrawals_per_day'), 2) then
    raise exception 'LIMIT_REACHED|You can make only % withdrawals per day', coalesce(public.setting_bigint('max_withdrawals_per_day'), 2);
  end if;
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
end $function$;