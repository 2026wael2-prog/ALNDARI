-- Fix 403 Forbidden on products INSERT/UPDATE: grant EXECUTE on normalize_arabic(text) to authenticated
GRANT EXECUTE ON FUNCTION public.normalize_arabic(text) TO authenticated;
