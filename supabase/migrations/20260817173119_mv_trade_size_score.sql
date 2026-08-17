create materialized view mv_trade_size_score as
select
	id as disclosure_event_id,
	percent_rank() over (
		partition by country, disclosure_type
		order by coalesce(amount_max, amount_min, 0)
	) as size_percentile
from disclosure_events;