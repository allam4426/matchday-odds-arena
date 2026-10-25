<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All money, betting, settlement and admin actions run in SECURITY DEFINER Postgres functions (place_bet, submit_deposit, admin_*); the browser calls them via supabase.rpc and never writes balances or statuses directly — keeps every financial change atomic and server-validated.
- Money is stored as integer minor units; every wallet movement inserts one immutable ledger_entries row with a unique reference — guarantees exactly-once credits/debits.
- Server functions raise errors as "CODE|message"; the UI parses them with parseRpcError.
- Staff roles live only in user_roles (super_admin, finance_admin, sports_trader, support_agent, auditor); finance and trading permissions are checked separately in each function.
- Match rows carry a provenance (sample/manual/provider) shown to customers; never present sample or manual data as a live feed.
