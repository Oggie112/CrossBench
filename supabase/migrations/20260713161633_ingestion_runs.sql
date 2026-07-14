create table ingestion_runs (
	id uuid primary key default gen_random_uuid(),
	source_name text not null,
	started_at timestamptz,
	finished_at timestamptz,
	records_fetched int,
	records_new int,
	status text,
	error_message text
);
