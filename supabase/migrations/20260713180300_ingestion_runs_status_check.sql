alter table ingestion_runs
	add constraint ingestion_runs_status_check
	check (status in ('running', 'success', 'partial', 'failed'));
