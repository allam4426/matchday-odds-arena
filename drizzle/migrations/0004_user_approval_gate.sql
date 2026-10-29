ALTER TABLE public.profiles ADD COLUMN approved boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ALTER COLUMN approved SET DEFAULT false;
UPDATE public.profiles p SET approved = true WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id);

CREATE OR REPLACE FUNCTION public._assert_active(_user uuid, _for_betting boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare p public.profiles%rowtype;
begin
  if _user is null then raise exception 'AUTH|Please sign in to continue'; end if;
  select * into p from public.profiles where id = _user;
  if not found then raise exception 'AUTH|Account profile not found'; end if;
  if not p.approved and not public.is_staff(_user) then raise exception 'PENDING_APPROVAL|Your account is waiting for admin approval.'; end if;
  if p.status in ('suspended','closed') then raise exception 'ACCOUNT_RESTRICTED|Your account is %. Contact support.', p.status; end if;
  if _for_betting and p.self_excluded_until is not null and p.self_excluded_until > now() then
    raise exception 'SELF_EXCLUDED|You are self-excluded until %', to_char(p.self_excluded_until, 'DD Mon YYYY');
  end if;
  if _for_betting and p.cooling_off_until is not null and p.cooling_off_until > now() then
    raise exception 'COOLING_OFF|You are on a cooling-off break until %', to_char(p.cooling_off_until, 'DD Mon YYYY HH24:MI');
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_approve_user(_user uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'support_agent')) then
    raise exception 'FORBIDDEN|Only super admins or support agents can approve users';
  end if;
  if _approve then
    update public.profiles set approved = true where id = _user;
  else
    update public.profiles set approved = false, status = 'closed' where id = _user;
  end if;
  perform public._audit(case when _approve then 'user.approve' else 'user.reject' end, 'profile', _user::text, '{}'::jsonb);
end $function$;
REVOKE ALL ON FUNCTION public.admin_approve_user(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin_approve() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ begin update public.profiles set approved = true where id = new.user_id; return new; end $$;
CREATE TRIGGER user_roles_auto_approve AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.claim_first_admin_approve();