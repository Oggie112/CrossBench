create table raw_documents (
	id uuid primary key default gen_random_uuid(),
	country text not null,
	source_name text not null,
	source_ref text not null,
	fetched_at timestamptz default now(),
	storage_path text,
	processed boolean default false,
	processing_error text,
	unique (source_name, source_ref)
);
