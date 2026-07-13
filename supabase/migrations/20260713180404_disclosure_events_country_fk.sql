alter table disclosure_events
	add constraint disclosure_events_country_fkey
	foreign key (country) references countries(code);
