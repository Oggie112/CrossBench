-- Mirrors committees/official_committee_memberships/committee_sector_relevance,
-- not reused directly - EU Commissioner portfolios are 1:1 (no role
-- gradient), have no chamber concept, and titles reshuffle every 5-year
-- Commission term rather than staying stable by name like UK/US committees.
-- See docs/plan/3rnk1-prerequisites.md step 6.

create table portfolios (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	country text not null,
	external_ids jsonb default '{}',
	constraint portfolios_country_fkey foreign key (country) references countries(code)
);

create table official_portfolios (
	official_id uuid references officials(id),
	portfolio_id uuid references portfolios(id),
	start_date date,
	end_date date,
	primary key (official_id, portfolio_id, start_date),
	constraint official_portfolios_date_range_check check (end_date is null or end_date >= start_date)
);

create table portfolio_sector_relevance (
	portfolio_id uuid references portfolios(id),
	sector text not null,
	weight numeric not null check (weight between 0 and 1),
	primary key (portfolio_id, sector)
);
