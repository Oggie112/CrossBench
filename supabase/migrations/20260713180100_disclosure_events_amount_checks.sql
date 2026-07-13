alter table disclosure_events
	add constraint disclosure_events_amount_min_check
	check (amount_min is null or amount_min >= 0);

alter table disclosure_events
	add constraint disclosure_events_amount_max_check
	check (amount_max is null or amount_max >= 0);

alter table disclosure_events
	add constraint disclosure_events_amount_range_check
	check (amount_min is null or amount_max is null or amount_max >= amount_min);
