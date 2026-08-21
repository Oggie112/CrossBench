-- supabase-js has no way to run arbitrary SQL (it's a PostgREST wrapper, not
-- a raw SQL client) - REFRESH MATERIALIZED VIEW has to be exposed as an RPC
-- function for app code to call it. Plain REFRESH (not CONCURRENTLY) takes
-- an ACCESS EXCLUSIVE lock, briefly blocking reads during the refresh - not
-- CONCURRENTLY here since that requires a unique index on every view, none
-- of which exist yet; acceptable at current traffic, revisit if it matters.
create or replace function refresh_ranking_views()
returns void
language plpgsql
as $$
begin
	refresh materialized view mv_trade_size_score;
	refresh materialized view mv_cluster_score;
	refresh materialized view mv_cross_jurisdiction_score;
	-- must run last - depends on all three views above
	refresh materialized view mv_signal_scores;
end;
$$;