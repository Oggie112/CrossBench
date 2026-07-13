create table securities (
	id uuid primary key default gen_random_uuid(),
	canonical_name text not null,
	primary_ticker text,
	primary_exchange text,
	sector text,
	isin text
);
