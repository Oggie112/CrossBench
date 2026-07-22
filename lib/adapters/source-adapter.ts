export type Country = "US" | "UK" | "AU" | "EU";

export type DisclosureType = "transaction" | "holding_change" | "holding_snapshot";
export type TransactionType = "buy" | "sell" | "exchange";
export type InstrumentType = "equity" | "option_call" | "option_put" | "bond" | "other";

export interface RawDocument {
	sourceName: string;
	sourceRef: string;
	country: Country;
	content: unknown;
}

export interface ParsedDisclosure {
	officialExternalId: string;
	rawSecurityText: string;
	country: Country;
	disclosureType: DisclosureType;
	transactionType?: TransactionType;
	instrumentType?: InstrumentType;
	transactionDate?: string;
	notificationDate?: string;
	amountMin?: number;
	amountMax?: number;
	currency?: string;
	valueBand?: string;
	asOfDate?: string;
	confidence?: "high" | "low";
}

export interface SourceAdapter {
	readonly sourceName: string;
	readonly country: Country;

	// knownSourceRefs lets orchestration tell an adapter which source_refs
	// already exist in raw_documents, so a source that has to fetch each
	// document individually (e.g. one HTTP request per PDF) can skip
	// re-downloading ones it's already stored. Optional and ignorable -
	// adapters that fetch everything in one request (UK, EU) have no need
	// for it.
	fetch(knownSourceRefs?: ReadonlySet<string>): Promise<RawDocument[]>;
	parse(document: RawDocument): Promise<ParsedDisclosure[]>;
}
