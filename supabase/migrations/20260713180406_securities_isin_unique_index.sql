create unique index securities_isin_unique_idx
	on securities (isin)
	where isin is not null;
