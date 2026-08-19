import { supabaseAdmin } from "../supabase";
import { parseSecurityText, normalizeNameAlias, type ParsedSecurity } from "./parse-security-text";
import { findByIdentifier, insertIdentifier, lookupTickerOwner, YAHOO_LOOKUP_CONTEXT } from "./security-identifiers";

interface DisclosureRow {
	id: string;
	raw_security_text: string;
}

async function fetchUnresolvedRows(): Promise<DisclosureRow[]> {
	const rows: DisclosureRow[] = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabaseAdmin
			.from("disclosure_events")
			.select("id, raw_security_text")
			.is("security_id", null)
			.range(from, from + pageSize - 1);
		if (error) throw error;
		for (const row of data) if (row.raw_security_text) rows.push({ id: row.id, raw_security_text: row.raw_security_text });
		if (data.length < pageSize) break;
		from += pageSize;
	}
	return rows;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only paces genuine Yahoo calls (see resolveSecurity's name-only branch),
// not the thousands of cheap cache/DB hits this loop otherwise does -
// matches classify-sectors.ts's pacing rationale, applied conditionally
// since this loop is mixed-source rather than uniformly Yahoo-calling.
const YAHOO_REQUEST_DELAY_MS = 200;

// Cache keyed by whichever identifier resolved a security, so the huge
// amount of real repetition (the same handful of tickers appear on
// hundreds of disclosure rows) doesn't cost a DB round-trip per row.
type ResolutionCache = Map<string, string>;

async function resolveSecurity(parsed: ParsedSecurity, cache: ResolutionCache): Promise<{ securityId: string; isNew: boolean }> {
	const nameKey = normalizeNameAlias(parsed.canonicalName);

	const cacheKeys = [
		parsed.ticker && `ticker:${parsed.ticker}`,
		parsed.cusip && `cusip:${parsed.cusip}`,
		`name:${nameKey}`,
	].filter((k): k is string => Boolean(k));

	for (const key of cacheKeys) {
		const cached = cache.get(key);
		if (cached) return { securityId: cached, isNew: false };
	}

	if (parsed.ticker) {
		const found = await findByIdentifier("ticker", parsed.ticker);
		if (found) return finish(found, cacheKeys, cache, false);
	}
	if (parsed.cusip) {
		const found = await findByIdentifier("cusip", parsed.cusip);
		if (found) return finish(found, cacheKeys, cache, false);
	}
	const foundByName = await findByIdentifier("name_alias", nameKey);
	if (foundByName) return finish(foundByName, cacheKeys, cache, false);

	// Name-only text (UK/EU disclosures never carry a ticker) - try
	// resolving it via Yahoo Finance search before falling back to a
	// name_alias-only security. See lib/securities/security-identifiers.ts.
	let yahooTicker: string | null = null;
	if (!parsed.ticker && !parsed.cusip) {
		const lookup = await lookupTickerOwner(parsed.canonicalName);
		await sleep(YAHOO_REQUEST_DELAY_MS);
		if (lookup) {
			yahooTicker = lookup.symbol;
			if (lookup.existingSecurityId) {
				// This UK/EU text resolved to a ticker a security already
				// owns (e.g. from a prior US disclosure) - the actual
				// cross-jurisdiction match happening.
				await insertIdentifier(lookup.existingSecurityId, "name_alias", nameKey, YAHOO_LOOKUP_CONTEXT);
				return finish(lookup.existingSecurityId, [...cacheKeys, `ticker:${yahooTicker}`], cache, false);
			}
		}
	}

	const { data: created, error } = await supabaseAdmin
		.from("securities")
		.insert({ canonical_name: parsed.canonicalName, primary_ticker: parsed.ticker ?? yahooTicker ?? null })
		.select("id")
		.single();
	if (error || !created) throw new Error(`Failed to create security "${parsed.canonicalName}": ${error?.message}`);

	if (parsed.ticker) await insertIdentifier(created.id, "ticker", parsed.ticker);
	if (parsed.cusip) await insertIdentifier(created.id, "cusip", parsed.cusip);
	if (yahooTicker) await insertIdentifier(created.id, "ticker", yahooTicker, YAHOO_LOOKUP_CONTEXT);
	await insertIdentifier(created.id, "name_alias", nameKey);

	return finish(created.id, yahooTicker ? [...cacheKeys, `ticker:${yahooTicker}`] : cacheKeys, cache, true);
}

function finish(
	securityId: string,
	cacheKeys: string[],
	cache: ResolutionCache,
	isNew: boolean,
): { securityId: string; isNew: boolean } {
	for (const key of cacheKeys) cache.set(key, securityId);
	return { securityId, isNew };
}

async function main() {
	console.log("Fetching disclosure_events without security_id...");
	const rows = await fetchUnresolvedRows();
	console.log(`${rows.length} rows to resolve`);

	const cache: ResolutionCache = new Map();
	let created = 0;
	let matched = 0;
	let tickerCount = 0;
	let cusipCount = 0;
	let nameOnlyCount = 0;

	for (const row of rows) {
		const parsed = parseSecurityText(row.raw_security_text);
		if (parsed.ticker) tickerCount++;
		else if (parsed.cusip) cusipCount++;
		else nameOnlyCount++;

		const { securityId, isNew } = await resolveSecurity(parsed, cache);
		if (isNew) created++;
		else matched++;

		const { error } = await supabaseAdmin.from("disclosure_events").update({ security_id: securityId }).eq("id", row.id);
		if (error) throw new Error(`Failed to backfill disclosure_event ${row.id}: ${error.message}`);
	}

	console.log(`${created} new securities created, ${matched} rows matched to an already-resolved security`);
	console.log(`${tickerCount} ticker-identified, ${cusipCount} CUSIP-identified, ${nameOnlyCount} name-only`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
