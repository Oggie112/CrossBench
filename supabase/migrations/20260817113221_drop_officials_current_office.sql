-- Confirmed unused: never populated by seed-uk.ts/seed-us.ts/seed-eu.ts,
-- never read anywhere. The portfolios table now covers the one credible use
-- case that had been proposed for it (a leadership/office title distinct
-- from chamber and committee membership). See
-- docs/plan/3rnk1-prerequisites.md step 6.

alter table officials
	drop column current_office;
