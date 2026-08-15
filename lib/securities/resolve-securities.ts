import { supabaseAdmin } from "../supabase";
import { parseSecurityText, normalizeNameAlias, type ParsedSecurity } from "./parse-security-text";

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

async function findByIdentifier(type: string, value: string): Promise<string | null> {
	const { data } = await supabaseAdmin
		.from("security_identifiers")
		.select("security_id")
		.eq("identifier_type", type)
		.eq("identifier_value", value)
		.maybeSingle();
	return data?.security_id ?? null;
}

async function insertIdentifier(securityId: string, type: string, value: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("security_identifiers")
		.insert({ security_id: securityId, identifier_type: type, identifier_value: value });
	if (error) throw new Error(`Failed to insert ${type} identifier "${value}": ${error.message}`);
}

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

	const { data: created, error } = await supabaseAdmin
		.from("securities")
		.insert({ canonical_name: parsed.canonicalName, primary_ticker: parsed.ticker ?? null })
		.select("id")
		.single();
	if (error || !created) throw new Error(`Failed to create security "${parsed.canonicalName}": ${error?.message}`);

	if (parsed.ticker) await insertIdentifier(created.id, "ticker", parsed.ticker);
	if (parsed.cusip) await insertIdentifier(created.id, "cusip", parsed.cusip);
	await insertIdentifier(created.id, "name_alias", nameKey);

	return finish(created.id, cacheKeys, cache, true);
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
