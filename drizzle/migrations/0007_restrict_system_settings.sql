DROP POLICY IF EXISTS "Settings are readable" ON public.system_settings;
CREATE POLICY "Public settings readable" ON public.system_settings FOR SELECT TO anon, authenticated
USING (key IN ('currency','real_money_enabled','min_deposit_minor','max_deposit_minor','min_withdrawal_minor','max_withdrawal_minor','max_withdrawals_per_day','min_stake_minor','max_stake_minor','max_payout_minor','max_combo_selections'));
CREATE POLICY "Signed-in users read bank settings" ON public.system_settings FOR SELECT TO authenticated
USING (key IN ('bank_details','bank_accounts'));
CREATE POLICY "Staff read all settings" ON public.system_settings FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));