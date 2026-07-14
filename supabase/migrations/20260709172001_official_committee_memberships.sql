create table official_committee_memberships (
	official_id uuid references officials(id),
	committee_id uuid references committees(id),
	role text,
	start_date date,
	end_date date,
	primary key (official_id, committee_id, start_date)
);
