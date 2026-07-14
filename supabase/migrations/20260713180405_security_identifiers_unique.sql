alter table security_identifiers
	add constraint security_identifiers_type_value_unique
	unique (identifier_type, identifier_value);
