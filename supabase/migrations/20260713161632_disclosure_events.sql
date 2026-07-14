create table disclosure_events (
	id uuid primary key default gen_random_uuid(),
	official_id uuid references officials(id),
	security_id uuid references securities(id),
	raw_security_text text,
	country text not null,
	disclosure_type text not null,
	transaction_type text,
	instrument_type text default 'equity',
	transaction_date date,
	notification_date date,
	amount_min numeric,
	amount_max numeric,
	value_band text,
	as_of_date date,
	source_document_id uuid references raw_documents(id),
	confidence text default 'high',
	created_at timestamptz default now()
);
