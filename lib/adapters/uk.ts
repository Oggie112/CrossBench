import type { ParsedDisclosure, RawDocument, SourceAdapter } from "./source-adapter";

const API_BASE = "https://interests-api.parliament.uk/api/v1";
const SHAREHOLDINGS_CATEGORY_ID = 8;
// UK shareholding disclosures publish on roughly a 28-day cadence; this gives
// margin over that plus a few days of cron downtime tolerance.
const FETCH_WINDOW_DAYS = 40;
const PAGE_SIZE = 20;

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
				valueBand: threshold ?? undefined,
				confidence: "high",
			},
		];
	},
};
