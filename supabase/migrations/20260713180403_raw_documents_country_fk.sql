alter table raw_documents
	add constraint raw_documents_country_fkey
	foreign key (country) references countries(code);
