create table officials (
	id uuid primary key default gen_random_uuid(),
	full_name text not null,
	country text not null,
	chamber text not null,
	party text,
	current_office text,
	external_ids jsonb default '{}'
);
