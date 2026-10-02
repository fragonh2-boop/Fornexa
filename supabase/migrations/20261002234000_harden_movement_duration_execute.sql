-- The function is a trigger implementation, not an RPC surface.
-- Keep it executable by the database trigger while blocking direct Data API calls.
revoke execute on function public.fornexa_calc_movement_duration() from public, anon, authenticated;
