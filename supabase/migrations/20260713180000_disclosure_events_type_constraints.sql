alter table disclosure_events
	add constraint disclosure_events_disclosure_type_check
	check (disclosure_type in ('transaction', 'holding_change', 'holding_snapshot'));

alter table disclosure_events
	add constraint disclosure_events_transaction_type_check
	check (transaction_type in ('buy', 'sell', 'exchange'));

alter table disclosure_events
	add constraint disclosure_events_instrument_type_check
	check (instrument_type in ('equity', 'option_call', 'option_put', 'bond', 'other'));
