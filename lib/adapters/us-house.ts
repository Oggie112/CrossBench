import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import PDFParser from "pdf2json";
import type { Output as PdfOutput } from "pdf2json";
import type { InstrumentType, ParsedDisclosure, RawDocument, SourceAdapter, TransactionType } from "./source-adapter";

const YEAR = new Date().getFullYear();
const INDEX_ZIP_URL = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${YEAR}FD.zip`;
const PTR_PDF_BASE = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${YEAR}`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;

// Column x-positions on the rendered PTR form, verified against real filings
// from multiple members. Ranges are wide relative to the gaps between real
// column positions (4-10 units apart), so small per-document jitter (e.g.
// 23.6 vs 23.7) doesn't matter.
const COLUMN_RANGES = {
	ownerCode: [0, 5] as const,
	asset: [5, 15] as const,
	transactionType: [15, 19] as const,
	transactionDate: [19, 22.5] as const,
	notificationDate: [22.5, 26] as const,
	amount: [26, 32] as const,
};

const TRANSACTION_TYPE_RE = /^[PSE]\b/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const FILER_STATUS_RE = /^FS?\s*:/;
const OWNER_RE = /^SO\s*:/;
const DESCRIPTION_RE = /^D\s*:/;
// The "Owner Asset" column sub-header repeats at the top of every page and
// its "Asset" word overlaps the asset column's x-range, so its tail ("er
// Asset") was getting folded into whatever transaction preceded it across a
// page break. Must be excluded the same way label rows are.
const HEADER_ROW_RE = /Owner.*Asset|ID.*Owner/;

interface MemberEntry {
	Prefix?: string;
	Last: string;
	First: string;
	Suffix?: string;
	FilingType: string;
	DocID: string;
}

interface HouseRawContent {
	pdfBuffer: Buffer;
	member: { last: string; first: string };
}

interface Fragment {
	x: number;
	str: string;
}

interface Row {
	fragments: Fragment[];
}

interface RawTransaction {
	assetText: string;
	transactionTypeText: string;
	transactionDate: string;
	notificationDate: string;
	amountText: string;
	descriptionText: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (response.ok) return response;
		if (attempt === retries) {
			throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${response.status}`);
		}
		await sleep(500 * (attempt + 1));
	}
	throw new Error("unreachable");
}

// fast-xml-parser auto-converts numeric-looking text (DocID) to JS numbers
// by default - same issue hit while building the EU adapter. Disabled here
// for the same reason: DocID needs to stay a string.
const indexXmlParser = new XMLParser({ parseTagValue: false });

function parseIndex(xml: string): MemberEntry[] {
	const doc = indexXmlParser.parse(xml);
	const members = doc.FinancialDisclosure?.Member;
	if (!members) return [];
	return Array.isArray(members) ? members : [members];
}

function nameSlug(member: { last: string; first: string }): string {
	return `${member.first}-${member.last}`
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function parsePdfBuffer(buffer: Buffer): Promise<PdfOutput> {
	return new Promise((resolve, reject) => {
		const parser = new PDFParser();
		parser.on("pdfParser_dataError", (err) => reject(err instanceof Error ? err : err.parserError));
		parser.on("pdfParser_dataReady", (data) => resolve(data));
		parser.parseBuffer(buffer);
	});
}

function extractRows(pages: PdfOutput["Pages"]): Row[] {
	const rows: Row[] = [];
	for (const page of pages) {
		const fragments: { x: number; y: number; str: string }[] = [];
		for (const text of page.Texts) {
			// PDF glyph-positioning artifacts (e.g. from the decorative "PTR"
			// letterhead) come through as null-byte characters, not empty
			// strings - .trim() doesn't strip control characters, so these
			// silently survived a plain emptiness check and broke every
			// regex downstream that expected adjacent, uninterrupted chars.
			const decoded = decodeURIComponent(text.R.map((r) => r.T).join(""));
			const str = [...decoded].filter((c) => c.charCodeAt(0) !== 0).join("");
			if (str.trim().length === 0) continue;
			fragments.push({ x: text.x, y: text.y, str });
		}

		const byY = new Map<number, Fragment[]>();
		for (const f of fragments) {
			const key = Math.round(f.y * 10) / 10;
			const existing = byY.get(key);
			if (existing) existing.push({ x: f.x, str: f.str });
			else byY.set(key, [{ x: f.x, str: f.str }]);
		}

		const pageRows = [...byY.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([, frags]) => ({ fragments: frags.sort((a, b) => a.x - b.x) }));
		rows.push(...pageRows);
	}
	return rows;
}

function textInRange(row: Row, [min, max]: readonly [number, number]): string {
	return row.fragments
		.filter((f) => f.x >= min && f.x < max)
		.map((f) => f.str)
		.join(" ")
		.trim();
}

function rowJoinedText(row: Row): string {
	return row.fragments.map((f) => f.str).join("");
}

function isTransactionStartRow(row: Row): boolean {
	const type = textInRange(row, COLUMN_RANGES.transactionType);
	const txDate = textInRange(row, COLUMN_RANGES.transactionDate);
	const notifDate = textInRange(row, COLUMN_RANGES.notificationDate);
	return TRANSACTION_TYPE_RE.test(type) && DATE_RE.test(txDate) && DATE_RE.test(notifDate);
}

function isLabelRow(row: Row): boolean {
	const joined = rowJoinedText(row);
	return FILER_STATUS_RE.test(joined) || OWNER_RE.test(joined) || DESCRIPTION_RE.test(joined);
}

function isHeaderRow(row: Row): boolean {
	return HEADER_ROW_RE.test(rowJoinedText(row));
}

function extractTransactions(rows: Row[]): RawTransaction[] {
	const transactions: RawTransaction[] = [];
	let i = 0;

	while (i < rows.length) {
		if (!isTransactionStartRow(rows[i])) {
			i++;
			continue;
		}

		let assetText = textInRange(rows[i], COLUMN_RANGES.asset);
		let amountText = textInRange(rows[i], COLUMN_RANGES.amount);
		const transactionTypeText = textInRange(rows[i], COLUMN_RANGES.transactionType);
		const transactionDate = textInRange(rows[i], COLUMN_RANGES.transactionDate);
		const notificationDate = textInRange(rows[i], COLUMN_RANGES.notificationDate);
		i++;

		// Long amount bands and long asset names wrap onto a second physical
		// line, in the same x-columns, with no transaction-type/dates of
		// their own. Fold that continuation in if present.
		if (i < rows.length && !isTransactionStartRow(rows[i]) && !isLabelRow(rows[i]) && !isHeaderRow(rows[i])) {
			const contAsset = textInRange(rows[i], COLUMN_RANGES.asset);
			const contAmount = textInRange(rows[i], COLUMN_RANGES.amount);
			if (contAsset || contAmount) {
				assetText = [assetText, contAsset].filter(Boolean).join(" ");
				amountText = [amountText, contAmount].filter(Boolean).join(" ");
				i++;
			}
		}

		let descriptionText = "";
		let insideDescription = false;
		while (i < rows.length && !isTransactionStartRow(rows[i])) {
			const joined = rowJoinedText(rows[i]);
			if (DESCRIPTION_RE.test(joined)) insideDescription = true;
			else if (FILER_STATUS_RE.test(joined) || OWNER_RE.test(joined)) insideDescription = false;

			if (insideDescription) descriptionText += " " + joined;
			i++;
		}

		transactions.push({
			assetText,
			transactionTypeText,
			transactionDate,
			notificationDate,
			amountText,
			descriptionText,
		});
	}

	return transactions;
}

function extractBracketCode(assetText: string): string | undefined {
	return assetText.match(/\[([A-Z]+)\]/)?.[1];
}

function cleanAssetText(assetText: string): string {
	return assetText
		.replace(/\[([A-Z]+)\]/, "")
		.trim();
}

function mapTransactionType(typeText: string): TransactionType {
	if (typeText.startsWith("P")) return "buy";
	if (typeText.startsWith("S")) return "sell";
	if (typeText.startsWith("E")) return "exchange";
	throw new Error(`Unrecognized transaction type: "${typeText}"`);
}

function mapInstrumentType(bracketCode: string | undefined, descriptionText: string): InstrumentType {
	switch (bracketCode) {
		case "ST":
		case "PS":
		case "RS":
			return "equity";
		case "GS":
		case "CS":
		case "AB":
		case "CT":
			return "bond";
		case "OP":
			return /\bput\b/i.test(descriptionText) ? "option_put" : "option_call";
		default:
			return "other";
	}
}

// Every real amount band observed is "$X,XXX - $Y,YYY" (two comma-grouped
// figures) - a single match means either a mis-fold across a malformed
// page break, or a non-band amount format (e.g. exchange transactions,
// which report a per-share fair-market value like "$15.00" instead of a
// band). Neither is safe to guess at, so this throws rather than emit a
// truncated/wrong figure - callers should skip the transaction, not the
// whole document.
function parseAmountBand(text: string): { min: number; max: number } {
	const numbers = [...text.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
	if (numbers.length !== 2) {
		throw new Error(`Expected a two-figure amount band, got ${numbers.length} figure(s): "${text}"`);
	}
	return { min: numbers[0], max: numbers[1] };
}

function normalizeDate(mmddyyyy: string): string {
	const match = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (!match) throw new Error(`Unrecognized date format: "${mmddyyyy}"`);
	const [, mm, dd, yyyy] = match;
	return `${yyyy}-${mm}-${dd}`;
}

export const usHouseAdapter: SourceAdapter = {
	sourceName: "us_house_ptr",
	country: "US",

	async fetch(knownSourceRefs?: ReadonlySet<string>): Promise<RawDocument[]> {
		const zipResponse = await fetchWithRetry(INDEX_ZIP_URL);
		const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer());

		const xmlFile = zip.file(`${YEAR}FD.xml`);
		if (!xmlFile) throw new Error(`Expected ${YEAR}FD.xml in index ZIP, not found`);

		const entries = parseIndex(await xmlFile.async("string")).filter((e) => e.FilingType === "P");

		const documents: RawDocument[] = [];
		for (const entry of entries) {
			if (knownSourceRefs?.has(entry.DocID)) continue;

			const pdfResponse = await fetchWithRetry(`${PTR_PDF_BASE}/${entry.DocID}.pdf`);
			const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

			const content: HouseRawContent = {
				pdfBuffer,
				member: { last: entry.Last, first: entry.First },
			};

			documents.push({
				sourceName: "us_house_ptr",
				sourceRef: entry.DocID,
				country: "US",
				content,
			});

			await sleep(REQUEST_DELAY_MS);
		}

		return documents;
	},

	async parse(document: RawDocument): Promise<ParsedDisclosure[]> {
		const { pdfBuffer, member } = document.content as HouseRawContent;
		const officialExternalId = nameSlug(member);

		const output = await parsePdfBuffer(pdfBuffer);
		const rows = extractRows(output.Pages);
		const rawTransactions = extractTransactions(rows);

		const disclosures: ParsedDisclosure[] = [];
		for (const raw of rawTransactions) {
			try {
				const bracketCode = extractBracketCode(raw.assetText);
				const { min, max } = parseAmountBand(raw.amountText);

				disclosures.push({
					officialExternalId,
					rawSecurityText: cleanAssetText(raw.assetText),
					country: "US",
					disclosureType: "transaction",
					transactionType: mapTransactionType(raw.transactionTypeText),
					instrumentType: mapInstrumentType(bracketCode, raw.descriptionText),
					transactionDate: normalizeDate(raw.transactionDate),
					notificationDate: normalizeDate(raw.notificationDate),
					amountMin: min,
					amountMax: max,
					confidence: "high",
				});
			} catch (err) {
				// One malformed transaction (page-break artifacts, non-band
				// exchange amounts) shouldn't cost the rest of a filing that
				// can have 200+ legitimate rows. Logged loudly, not silently
				// dropped - see parseAmountBand's reasoning.
				console.error(`Skipping unparseable transaction in ${document.sourceRef}:`, err, raw);
			}
		}

		return disclosures;
	},
};
