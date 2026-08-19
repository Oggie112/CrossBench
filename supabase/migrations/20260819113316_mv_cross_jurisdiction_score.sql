create materialized view mv_cross_jurisdiction_score as
select
	security_id,
	count(distinct country) as country_count
from disclosure_events
where coalesce(transaction_date, notification_date, as_of_date, created_at::date)
	>= current_date - interval '90 days'
	and security_id is not null
group by security_id;
