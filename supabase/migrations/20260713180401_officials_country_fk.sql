alter table officials
	add constraint officials_country_fkey
	foreign key (country) references countries(code);
