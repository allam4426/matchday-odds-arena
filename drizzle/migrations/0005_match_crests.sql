ALTER TABLE public.matches ADD COLUMN home_crest text, ADD COLUMN away_crest text;
CREATE OR REPLACE FUNCTION public.provider_set_crests(_items jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  update public.matches m set home_crest = i->>'hc', away_crest = i->>'ac'
  from jsonb_array_elements(_items) i
  where m.provider_ref = i->>'ref' and (m.home_crest is distinct from i->>'hc' or m.away_crest is distinct from i->>'ac');
$$;
REVOKE ALL ON FUNCTION public.provider_set_crests(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_set_crests(jsonb) TO service_role;