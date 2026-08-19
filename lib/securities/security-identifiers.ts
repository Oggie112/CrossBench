import { supabaseAdmin } from "../supabase";
import { lookupByName } from "./yahoo-finance";

export const YAHOO_LOOKUP_CONTEXT = "yahoo:v1/finance/search";

export async function findByIdentifier(type: string, value: string): Promise<string | null> {
	const { data } = await supabaseAdmin
		.from("security_identifiers")
		.select("security_id")
		.eq("identifier_type", type)
		.eq("identifier_value", value)
		.maybeSingle();
	return data?.security_id ?? null;
}

export async function insertIdentifier(
	securityId: string,
	type: string,
	value: string,
	context: string | null = null,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("security_identifiers")
		.insert({ security_id: securityId, identifier_type: type, identifier_value: value, context });
	if (error) throw new Error(`Failed to insert ${type} identifier "${value}": ${error.message}`);
}

export interface TickerLookupResult {
	symbol: string;
	existingSecurityId: string | null;
}

// A ≥4-letter token shared between the query and Yahoo's returned name -
// cheap insurance against a silent identity-merge of two unrelated
// companies. Neither real case found while scoping this needed it (Yahoo's
// own relevance filtering already rejected the near-miss), but a wrong
// merge here is much harder to detect and undo later than a missed match.
function sharesSignificantToken(query: string, matchName: string): boolean {
	const tokenize = (text: string) =>
		text
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length >= 4);
	const queryTokens = new Set(tokenize(query));
	return tokenize(matchName).some((t) => queryTokens.has(t));
}

// Resolves free-text company names (UK/EU disclosures never carry a ticker)
// to a ticker via Yahoo Finance search, and reports whether a security
// already owns that ticker - the answer both the live resolution path and
// the backfill script need, kept in one place so they can't drift.
export async function lookupTickerOwner(canonicalName: string): Promise<TickerLookupResult | null> {
	const match = await lookupByName(canonicalName);
	if (!match) return null;
	if (!sharesSignificantToken(canonicalName, match.name)) return null;

	const existingSecurityId = await findByIdentifier("ticker", match.symbol);
	return { symbol: match.symbol, existingSecurityId };
}