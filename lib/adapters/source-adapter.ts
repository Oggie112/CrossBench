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

	fetch(): Promise<RawDocument[]>;
	parse(document: RawDocument): Promise<ParsedDisclosure[]>;
}
