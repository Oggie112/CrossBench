-- committee_relevance is pre-aggregated to one row per (official, sector)
-- before joining - officials commonly hold multiple committee memberships
-- (one real official has 20 rows in official_committee_memberships), and
-- end_date is never populated (0/4208 rows) so there's no way to filter to
-- "current" ones only. Joining the raw membership table directly fans out
-- one disclosure_events row into one row per membership. MAX(weight) takes
-- the highest sector relevance across every membership an official has ever
-- had, current or historical - an accepted simplification given end_date's
-- gap, not a deliberate "always use the max" design choice.
create materialized view mv_signal_scores as
with committee_relevance as (
	select
		ocm.official_id,
		csr.sector,
		max(csr.weight) as weight
	from official_committee_memberships ocm
	join committee_sector_relevance csr on csr.committee_id = ocm.committee_id
	group by ocm.official_id, csr.sector
)
select
	de.id as disclosure_event_id,
	de.official_id,
	de.security_id,
	de.country,
	de.instrument_type,
	de.transaction_date,
	ts.size_percentile,
	coalesce(cr.weight, 0) as committee_relevance,
	coalesce(cl.distinct_officials_90d, 1) as cluster_count,
	case when cx.country_count > 1 then 1 else 0 end as cross_jurisdiction_flag,
	(
		(0.30 * ts.size_percentile * case when de.instrument_type in ('option_call', 'option_put') then 2 else 1 end)
		+ (0.25 * coalesce(cr.weight, 0))
		+ (0.25 * least(coalesce(cl.distinct_officials_90d, 1) / 5.0, 1.0))
		+ (0.20 * case when cx.country_count > 1 then 1 else 0 end)
	) as signal_score
from disclosure_events de
join mv_trade_size_score ts on ts.disclosure_event_id = de.id
left join securities s on s.id = de.security_id
left join committee_relevance cr on cr.official_id = de.official_id and cr.sector = s.sector
left join mv_cluster_score cl on cl.security_id = de.security_id
left join mv_cross_jurisdiction_score cx on cx.security_id = de.security_id
where de.disclosure_type = 'transaction';