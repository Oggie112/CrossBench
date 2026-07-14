create table committee_sector_relevance (
	committee_id uuid references committees(id),
	sector text not null,
	weight numeric not null check (weight between 0 and 1),
	primary key (committee_id, sector)
);
