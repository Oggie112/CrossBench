create table committees (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	country text not null,
	chamber text not null
);
