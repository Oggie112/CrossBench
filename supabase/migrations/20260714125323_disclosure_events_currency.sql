alter table disclosure_events
	add column currency text;

alter table disclosure_events
	add constraint disclosure_events_currency_format_check
	check (currency is null or currency ~ '^[A-Z]{3}$');
