CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, email text, full_name text, username text, roles public.app_role[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN|Super admin only'; end if;
  return query
    select r.user_id, p.email, p.full_name, p.username, array_agg(r.role order by r.role)
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    group by r.user_id, p.email, p.full_name, p.username
    order by p.full_name nulls last;
end $$;
REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_staff_by_email(_email text, _role public.app_role)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_user uuid;
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN|Super admin only'; end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(_email)) limit 1;
  if v_user is null then raise exception 'NOT_FOUND|No registered account uses that email. Ask them to register first.'; end if;
  insert into public.user_roles(user_id, role) values (v_user, _role) on conflict do nothing;
  perform public._audit('grant_role', 'user', v_user::text, jsonb_build_object('role', _role, 'email', _email));
  return v_user;
end $$;
REVOKE ALL ON FUNCTION public.admin_add_staff_by_email(text, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_staff_by_email(text, public.app_role) TO authenticated;