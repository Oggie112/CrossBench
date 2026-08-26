-- RLS was never enabled anywhere, and anon/authenticated had been granted
-- full SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every table by default -
-- meaning anyone with the publishable key (baked into the client bundle by
-- Next.js's NEXT_PUBLIC_ convention) could read, edit, delete, or wipe any
-- table directly via the Supabase REST API, bypassing the app entirely.
-- None of this affects ingestion - supabaseAdmin uses the service_role
-- secret key, which bypasses RLS by design regardless of any policy here.

-- Public, read-only data - genuinely meant to be public, not user-scoped,
-- so a flat "select true" policy rather than row filtering. Write grants
-- revoked as defense-in-depth alongside RLS, not relied on alone.
alter table officials enable row level security;
create policy "public read access" on officials for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on officials from anon, authenticated;

alter table committees enable row level security;
create policy "public read access" on committees for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on committees from anon, authenticated;

alter table official_committee_memberships enable row level security;
create policy "public read access" on official_committee_memberships for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on official_committee_memberships from anon, authenticated;

alter table committee_sector_relevance enable row level security;
create policy "public read access" on committee_sector_relevance for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on committee_sector_relevance from anon, authenticated;

alter table securities enable row level security;
create policy "public read access" on securities for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on securities from anon, authenticated;

alter table security_identifiers enable row level security;
create policy "public read access" on security_identifiers for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on security_identifiers from anon, authenticated;

alter table portfolios enable row level security;
create policy "public read access" on portfolios for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on portfolios from anon, authenticated;

alter table official_portfolios enable row level security;
create policy "public read access" on official_portfolios for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on official_portfolios from anon, authenticated;

alter table portfolio_sector_relevance enable row level security;
create policy "public read access" on portfolio_sector_relevance for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on portfolio_sector_relevance from anon, authenticated;

alter table countries enable row level security;
create policy "public read access" on countries for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on countries from anon, authenticated;

alter table disclosure_events enable row level security;
create policy "public read access" on disclosure_events for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on disclosure_events from anon, authenticated;

-- Materialized views can't have RLS at all (confirmed directly - Postgres
-- rejects ALTER ... ENABLE ROW LEVEL SECURITY on relkind 'm' outright), so
-- a grant is the only lever. These had no anon/authenticated grants at all
-- until now - the opposite problem, since the future homepage leaderboard
-- (4FE.3) needs to read mv_signal_scores via the publishable key.
grant select on mv_trade_size_score, mv_cluster_score, mv_cross_jurisdiction_score, mv_signal_scores to anon, authenticated;

-- Internal pipeline/staging tables - no public value (processing errors,
-- operational metadata), never read via the publishable key today. Deny
-- everything to anon/authenticated rather than adding a read policy.
alter table raw_documents enable row level security;
revoke all on raw_documents from anon, authenticated;

alter table ingestion_runs enable row level security;
revoke all on ingestion_runs from anon, authenticated;
