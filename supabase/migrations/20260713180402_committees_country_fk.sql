alter table committees
	add constraint committees_country_fkey
	foreign key (country) references countries(code);
