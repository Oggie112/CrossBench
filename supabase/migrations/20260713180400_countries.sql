create table countries (
	code text primary key,
	name text not null
);

insert into countries (code, name) values
	('US', 'United States'),
	('UK', 'United Kingdom'),
	('AU', 'Australia'),
	('EU', 'EU Commission');
