alter table official_committee_memberships
	add constraint official_committee_memberships_date_range_check
	check (end_date is null or end_date >= start_date);
