import type { ParsedDisclosure, RawDocument, SourceAdapter } from "./source-adapter";

const API_BASE = "https://interests-api.parliament.uk/api/v1";
const SHAREHOLDINGS_CATEGORY_ID = 8;
// The 28-day figure is the registration deadline, not the actual publishing
// cadence - real Shareholdings-category volume is much sparser (4 published
// in the first 7.5 months of 2026, confirmed against the live API), so a
// short trailing window risks a record ageing out before the next cron run
// picks it up, with no backfill path once it does. 90 days gives real margin
// for that; cost is negligible since Take/Skip pagination scales with actual
// result count, not window size.
const FETCH_WINDOW_DAYS = 90;
const PAGE_SIZE = 20;

// Register bands never carry a ceiling (e.g. "valued at more than £70,000"),
// only a floor - amount_max is deliberately left unset rather than guessed.
// The percentage-of-company band ("over 15% of issued share capital") has no
// monetary figure in the source at all; anchored to the same £70,000 floor
// as the fixed-value band below as a rough "comparably notable" proxy, not a
// real value equivalence - the two thresholds aren't actually comparable,
// this is just the least-bad ordering key available for mv_trade_size_score.
const PERCENTAGE_BAND_ANCHOR = 70000;

function parseAmountMin(band: string | null): number | undefined {
	if (!band) return undefined;
	const poundMatch = band.match(/£([\d,]+)/);
	if (poundMatch) return Number(poundMatch[1].replace(/,/g, ""));
	if (/%/.test(band)) return PERCENTAGE_BAND_ANCHOR;
	return undefined;
}

interface InterestField {
	name: string;
	value: string | null;
}

interface InterestResponse {
	id: number;
	registrationDate: string;
	publishedDate: string;
	member: { id: number };
	fields: InterestField[];
}

interface InterestsPage {
	items: InterestResponse[];
	skip: number;
	totalResults: number;
}

function fieldValue(fields: InterestField[], name: string): string | null {
	return fields.find((field) => field.name === name)?.value ?? null;
}

export const ukAdapter: SourceAdapter = {
	sourceName: "uk_parliament_interests",
	country: "UK",

	async fetch(): Promise<RawDocument[]> {
		const publishedFrom = new Date(Date.now() - FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);

		const documents: RawDocument[] = [];
		let skip = 0;

		while (true) {
			const url = `${API_BASE}/Interests?CategoryId=${SHAREHOLDINGS_CATEGORY_ID}&PublishedFrom=${publishedFrom}&Take=${PAGE_SIZE}&Skip=${skip}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`UK interests fetch failed: ${response.status} ${response.statusText}`);
			}

			const page = (await response.json()) as InterestsPage;

			for (const interest of page.items) {
				documents.push({
					sourceName: "uk_parliament_interests",
					sourceRef: String(interest.id),
					country: "UK",
					content: interest,
				});
			}

			skip += page.items.length;
			if (page.items.length === 0 || skip >= page.totalResults) break;
		}

		return documents;
	},

	async parse(document: RawDocument): Promise<ParsedDisclosure[]> {
		const interest = document.content as InterestResponse;

		const organisationName = fieldValue(interest.fields, "OrganisationName");
		if (!organisationName) return [];

		const threshold = fieldValue(interest.fields, "ShareholdingThreshold");
		const registrableDate = fieldValue(interest.fields, "RegistrableDate");

		return [
			{
				officialExternalId: String(interest.member.id),
				rawSecurityText: organisationName,
				country: "UK",
				disclosureType: "holding_change",
				instrumentType: "equity",
				asOfDate: registrableDate ?? interest.registrationDate,
				notificationDate: interest.publishedDate,
				amountMin: parseAmountMin(threshold),
				valueBand: threshold ?? undefined,
				confidence: "high",
			},
		];
	},
};
