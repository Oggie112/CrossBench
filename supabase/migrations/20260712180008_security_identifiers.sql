create table security_identifiers (
	security_id uuid references securities(id),
	identifier_type text not null check (identifier_type in ('ticker', 'isin', 'cusip', 'sedol', 'name_alias')),
	identifier_value text not null,
	context text
);
