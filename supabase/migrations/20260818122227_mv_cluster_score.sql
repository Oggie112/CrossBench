create materialized view mv_cluster_score as
select
	security_id,
	count(distinct official_id) as distinct_officials_90d
from disclosure_events
where coalesce(transaction_date, notification_date, as_of_date, created_at::date)
	>= current_date - interval '90 days'
	and security_id is not null
group by security_id;